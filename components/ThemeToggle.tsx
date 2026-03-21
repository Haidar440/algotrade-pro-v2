import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'device';

const STORAGE_KEY = 'algoTradePro_theme';

const ThemeToggle: React.FC = () => {
    const [theme, setTheme] = useState<Theme>(() => {
        return (localStorage.getItem(STORAGE_KEY) as Theme) || 'device';
    });

    useEffect(() => {
        const html = document.documentElement;

        // Remove all theme override classes
        html.classList.remove('force-light', 'force-dark');

        if (theme === 'light') {
            html.classList.add('force-light');
        } else if (theme === 'dark') {
            html.classList.add('force-dark');
        }
        // 'device' = no class → follows OS via @media prefers-color-scheme

        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
        { value: 'light', icon: <Sun className="w-3.5 h-3.5" />, label: 'Light' },
        { value: 'dark', icon: <Moon className="w-3.5 h-3.5" />, label: 'Dark' },
        { value: 'device', icon: <Monitor className="w-3.5 h-3.5" />, label: 'System' },
    ];

    return (
        <div className="flex items-center rounded-lg p-0.5 gap-0.5"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    title={opt.label}
                    className="relative p-1.5 rounded-md transition-all duration-200"
                    style={{
                        background: theme === opt.value ? 'var(--accent-blue)' : 'transparent',
                        color: theme === opt.value ? '#fff' : 'var(--text-muted)',
                    }}
                >
                    {opt.icon}
                </button>
            ))}
        </div>
    );
};

export default ThemeToggle;
