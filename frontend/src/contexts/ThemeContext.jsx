import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext({ theme: 'dark' });

/**
 * Vittova is a dark-only design: every screen hard-codes dark surfaces and
 * light text. Following the phone's light system setting (the Android
 * default) turned only the page background light, hiding white headings, so
 * the theme is fixed to dark. Any "light" value saved by older builds is
 * cleared.
 */
export function ThemeProvider({ children }) {
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light');
        root.classList.add('dark');
        try { localStorage.removeItem('theme'); } catch { /* storage unavailable */ }
    }, []);

    return (
        <ThemeContext.Provider value={{ theme: 'dark' }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
