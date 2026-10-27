# Reading the results

## Violations versus needs-review

A **violation** is a rule an engine could decide, and it decided the page fails. Violations
fail the scan (exit 1). Treat a new one as a regression to fix, not as backlog.

A **needs-review** item (axe calls it `incomplete`) is a rule axe could not decide by itself,
for a stated reason, so it asks a person to look. These never fail the scan. They still have to
be dealt with, because if a known item prints exactly like a new one, the new one gets lost.

## Needs-review and acknowledgements

Once someone has checked a needs-review node by hand, add it to `acknowledged` in the config.
From then on the console and reports list it as **acknowledged**, and anything else as **NEW**.
The console prints only the new ones.

```js
acknowledged: [
  {
    rule: "color-contrast",        // axe rule id
    reason: "bgGradient",          // axe's messageKey: why it could not decide
    html: '<span class="author">', // substring of the node's markup (string or array)
    // targets: ["#exact > .css"], // or exact css paths, instead of html
    pages: "*",                    // or ["/app/library"]; default "*"
    why: "Text over the generated cover gradient; measured on all 360 hues in contrast.spec.ts: worst 5.00:1"
  }
]
```

Every entry needs a `rule` and either `html` or `targets`. An entry with neither would silence a
whole rule, so the scanner refuses to start.

**Key on markup, not on the css path.** axe reports the shortest *unique* selector, so the same
component is `button[title="Dark"] > span` on one page and a chain of utility classes on the
next, and either changes as soon as a sibling does. A substring of the element's own markup
(an `aria-label`, a distinctive class list) is stable across pages.

**Keep entries narrow on purpose.** Match the rule, the reason and the markup together. If any
of them changes (the element is restyled, or axe gives a different reason), the entry stops
matching and the item comes back as NEW. When that happens, check the item again. Don't widen
the entry to make it go away.

**Write down what was measured instead.** An acknowledgement says "axe could not measure this,
so we measured it another way". The `why` should say how, and ideally point at a test that keeps
measuring it. When the two are paired, a regression fails the test before the acknowledgement
can go stale.

Some reasons that usually deserve an entry, once checked:

| Rule / reason | Typical cause | What to verify instead |
| --- | --- | --- |
| `color-contrast` / `nonBmp` | Symbol glyphs used as icons (`☀ ☾ ◐`) | They are `aria-hidden` with a text alternative; the button's own colours pass |
| `color-contrast` / `bgGradient` | Text over a CSS gradient | Measure the text against every stop of the gradient |
| `color-contrast` / `imgNode` | Text over an `<svg>` or an image | What is really behind it; if it is a translucent bar over arbitrary content, measure against the worst pixel |
| `color-contrast` / `bgOverlap` | pdf.js and similar transparent text layers | The layer is invisible on purpose; what is seen is the canvas |
| `color-contrast` / `shortTextContent` | One character of svg `<text>` inside an icon | It is part of the glyph, in the icon's colour |
| `label-content-name-mismatch` | An icon-only button whose svg contains `<text>` | WCAG 2.5.3 is about a *visible text label*; an icon has none |

And one that usually does **not** deserve an entry: low-alpha text or badges over arbitrary
artwork (covers, photos). Here axe can't decide because the contrast really is unpredictable.
Give the element an opaque backing instead of acknowledging it.

## When engines disagree

They will, and that's expected:

- **Visibility.** axe skips `aria-hidden` nodes for contrast; pa11y checks them anyway because
  they are still *visible*. Decide which reading matches what a sighted user sees. Don't
  assume axe is right.
- **Names.** axe accepts a `placeholder` as an input's accessible name; HTML_CodeSniffer does
  not, and reports a missing label. `npm run demo:broken` shows this one. pa11y has the better
  case here, because the placeholder disappears once someone types.
- **Coverage.** Lighthouse runs a curated subset of axe and weights it. A Lighthouse 100 with
  axe violations usually means the failing rule isn't in Lighthouse's list, or the failure is
  in a theme, viewport or dialog that Lighthouse doesn't visit.

## Signed-in and signed-out

The console's `Signed :` line says whether the run had a session. A run without one grades the
login form on every gated route. It will look clean, and that tells you nothing about those
routes. To cover both, run once with `--login` and once without.

## What a scan cannot tell you

**Keyboard behaviour.** An ARIA role is a promise about keyboard behaviour, and a scanner can
only check that the promise was *made*. It reads `role="dialog"`, `role="tablist"` or
`role="radiogroup"`, finds it, and is satisfied. It cannot press Tab or an arrow key. Test each
contract next to its component instead:

| Pattern | Contract to test |
| --- | --- |
| Dialog / side panel | Focus moves in; Tab and Shift+Tab wrap; Escape closes; focus returns to the opener |
| Tabs | Arrows move and select; Home/End; disabled tabs skipped; one Tab stop for the strip |
| Radio group / segmented control | Arrows move within the group; one Tab stop |

**Whether focus can be seen.** WCAG 2.4.7 requires a visible focus indicator, and 1.4.11
requires it to reach 3:1 against its surroundings. A scanner can't see either. A unit test can
check that every interactive primitive declares a focus style, and that the accent colour it
uses reaches 3:1 on every surface in every theme. Watch for one trap: a focus outline drawn
*outside* an element inside an `overflow: auto` container is clipped by the scroller, so use an
inset ring there.

**Colour, systematically.** A scan only measures the colour pairs that happen to be on screen,
in the theme it happened to run. If your colours are design tokens, a unit test that measures
every text token against every surface token in every theme fails the build right away,
without anyone needing to run a scan in the right theme. It also catches pairs that no page
currently renders. Such a test can also ban the pattern behind most contrast regressions:
low-alpha text utilities (`text-ink/55`) outside a `disabled:` state.

**What a screen reader announces.** No tool answers that. It takes a person with NVDA,
JAWS, VoiceOver or TalkBack.

## Keeping a baseline

Once a scan comes back clean, write down what "clean" covered: which engines, how many runs,
signed in or not, and which needs-review items are acknowledged. Keep it next to your config. A
claim like "axe: 0 violations across 60 runs, signed in and out; pa11y clean and Lighthouse 100
on all nine routes, light theme only; 6 needs-review nodes acknowledged" is worth far more than
"a11y passes", because it also tells the next person what wasn't covered.
