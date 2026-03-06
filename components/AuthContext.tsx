import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, securePost } from '../services/api';

interface AuthContextType {
    isAuthenticated: boolean;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, email: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('algoTradePro_jwt'));
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!token);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        // Check if token exists on mount
        const storedToken = localStorage.getItem('algoTradePro_jwt');
        if (storedToken) {
            setToken(storedToken);
            setIsAuthenticated(true);
        }
        setIsLoading(false);

        // Listen for 401 logout events from api.ts
        const handleLogout = () => logout();
        window.addEventListener('auth:logout', handleLogout);
        return () => window.removeEventListener('auth:logout', handleLogout);
    }, []);

    const login = async (username: string, password: string) => {
        try {
            // Using the new JSON login endpoint
            const data: any = await securePost('/auth/login', { username, password });
            const newToken = data.access_token;

            if (newToken) {
                localStorage.setItem('algoTradePro_jwt', newToken);
                setToken(newToken);
                setIsAuthenticated(true);
            } else {
                throw new Error("Invalid response from login server");
            }
        } catch (err) {
            console.error("Login error", err);
            throw err;
        }
    };

    const register = async (username: string, email: string, password: string) => {
        try {
            await securePost('/auth/register', { username, email, password });
            // Auto login logic could go here, for now we let UI redirect to login
        } catch (err) {
            console.error("Registration error", err);
            throw err;
        }
    };

    const logout = () => {
        localStorage.removeItem('algoTradePro_jwt');
        setToken(null);
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, token, login, register, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
