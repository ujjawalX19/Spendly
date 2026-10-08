import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { DEFAULT_CHOICE, THEME_COLOR, THEME_KEY, readChoice, resolveTheme } from '../lib/theme';

const ThemeContext = createContext({ theme: 'dark', choice: DEFAULT_CHOICE, setChoice: () => {} });

const prefersLight = () => {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches; } catch { return false; }
};
const storedChoice = () => {
    try { return readChoice(window.localStorage.getItem(THEME_KEY)); } catch { return DEFAULT_CHOICE; }
};

/**
 * Applies the look to the page: the class on <html> switches every colour
 * token (index.css), the browser's theme colour follows, and on Android the
 * status-bar icons turn dark on the light look so they stay readable.
 *
 * Dark is the default. Every screen takes its colours from the tokens, so
 * both looks are complete; the phone's light setting is followed only when the
 * person picks "Match phone".
 */
export function ThemeProvider({ children }) {
    const [choice, setChoiceState] = useState(storedChoice);
    const [systemLight, setSystemLight] = useState(prefersLight);

    useEffect(() => {
        let mq;
        try { mq = window.matchMedia('(prefers-color-scheme: light)'); } catch { return undefined; }
        const onChange = (e) => setSystemLight(e.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);

    const theme = resolveTheme(choice, systemLight);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.toggle('light', theme === 'light');
        root.classList.toggle('dark', theme !== 'light');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
        if (Capacitor.isNativePlatform()) {
            // "Dark" style = light icons on a dark bar, and the reverse.
            SystemBars.setStyle({ style: theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => { /* older native build */ });
        }
    }, [theme]);

    const setChoice = useCallback((next) => {
        const value = readChoice(next);
        setChoiceState(value);
        try { window.localStorage.setItem(THEME_KEY, value); } catch { /* storage unavailable */ }
    }, []);

    const value = useMemo(() => ({ theme, choice, setChoice }), [theme, choice, setChoice]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
