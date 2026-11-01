# Accessibility report

**TalkBack, large-font and keyboard testing have not been done.** Only an automated browser check ran.

| Check | Method | Result |
|---|---|---|
| Sideways scroll at 320 px | Script, 22 of 24 planned routes | None |
| Buttons and links without a name | Same | None |
| Controls under 36 px tall | Same | 1, an inline link on Privacy |
| Crashes | Same | None |

**Caveat:** that sweep tripped the local rate limit, so later screens may have been checked without data. The rerun with data was interrupted and has no results. The check does not cover dialogs or sheets, and 36 px is below the usual 44–48 dp target.

Added earlier: light-theme text fixed on legal pages. Contrast was not measured.

## Not tested

Screen reader order and labels on the phone, Android largest font and display size, colour contrast in both themes, focus order in sheets, reduced motion, the calendar grid with TalkBack, and the widget with TalkBack.
