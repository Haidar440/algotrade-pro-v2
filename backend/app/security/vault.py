"""
Module: app/security/vault.py
Purpose: Credential encryption/decryption using Fernet symmetric encryption.

Broker credentials (API keys, passwords, TOTP secrets) are stored encrypted
in the database. This vault class handles encryption at rest.

Usage:
    vault = CredentialVault(key=settings.MASTER_ENCRYPTION_KEY)
    encrypted = vault.encrypt({"api_key": "xxx", "password": "yyy"})
    decrypted = vault.decrypt(encrypted)
"""

import json
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.exceptions import AlgoTradeError

logger = logging.getLogger(__name__)


class VaultDecryptionError(AlgoTradeError):
    """Raised when credential decryption fails (wrong key or corrupted data)."""

    def __init__(self) -> None:
        super().__init__(
            message="Failed to decrypt credentials. Master key may have changed.",
            error_code="VAULT_DECRYPTION_FAILED",
            status_code=500,
        )


class CredentialVault:
    """Encrypts and decrypts sensitive credentials using AES-256 (Fernet).

    The master encryption key is loaded from settings (MASTER_ENCRYPTION_KEY env var).
    This vault never stores the key as a class attribute beyond initialization.

    Attributes:
        _cipher: Fernet cipher instance — the only thing kept in memory.
    """

    def __init__(self, key: str) -> None:
        """Initialize vault with a Fernet-compatible encryption key.

        Args:
            key: Base64-encoded Fernet key from MASTER_ENCRYPTION_KEY env var.

        Raises:
            ValueError: If the key is not a valid Fernet key.
        """
        try:
            key_bytes = key.encode() if isinstance(key, str) else key
            self._cipher = Fernet(key_bytes)
        except Exception as exc:
            logger.error("Invalid MASTER_ENCRYPTION_KEY format")
            raise ValueError(
                "MASTER_ENCRYPTION_KEY must be a valid Fernet key. "
                "Generate: python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\""
            ) from exc

    def encrypt(self, data: dict) -> str:
        """Encrypt a dictionary of credentials.

        Args:
            data: Dictionary containing sensitive key-value pairs.

        Returns:
            Base64-encoded encrypted string (safe for database storage).
        """
        json_bytes = json.dumps(data, sort_keys=True).encode("utf-8")
        encrypted = self._cipher.encrypt(json_bytes)
        logger.debug("Credentials encrypted (keys: %s)", list(data.keys()))
        return encrypted.decode("utf-8")

    def decrypt(self, token: str) -> dict:
        """Decrypt an encrypted credential string back to a dictionary.

        Args:
            token: Base64-encoded encrypted string from database.

        Returns:
            Original dictionary of credentials.

        Raises:
            VaultDecryptionError: If decryption fails (wrong key, corrupted data).
        """
        try:
            token_bytes = token.encode("utf-8") if isinstance(token, str) else token
            decrypted = self._cipher.decrypt(token_bytes)
            return json.loads(decrypted.decode("utf-8"))
        except InvalidToken:
            logger.error("Credential decryption failed — possible key mismatch")
            raise VaultDecryptionError()
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            logger.error("Decrypted data is not valid JSON: %s", exc)
            raise VaultDecryptionError()
