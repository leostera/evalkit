---
name: EvalKit dashboard
description: Black-and-white operations workspace for eval results
colors:
  ink: '#171717'
  muted: '#595959'
  canvas: '#ffffff'
  surface: '#ffffff'
  surface-subtle: '#f5f5f5'
  surface-hover: '#f8f8f8'
  line: '#e5e5e5'
  line-strong: '#b8b8b8'
  sidebar: '#171717'
  sidebar-ink: '#fafafa'
  sidebar-muted: '#bdbdbd'
  sidebar-hover: '#2e2e2e'
  sidebar-active: '#343434'
  success-bg: '#ededed'
  danger-bg: '#ffffff'
  pending-bg: '#f5f5f5'
typography:
  title:
    fontFamily: 'Helvetica Neue, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '23px'
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: '-0.035em'
  body:
    fontFamily: 'Helvetica Neue, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '14px'
    lineHeight: 1.5
  data:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: '12px'
  section:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '17px'
  subheading:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '13px'
  table:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '13px'
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '10px'
  touch-input:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '16px'
rounded:
  control: '2px'
  surface: '2px'
  detail: '4px'
spacing:
  compact: '6px'
  row: '8px'
  group: '14px'
  section: '16px'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.control}'
    padding: '7px 11px'
  input-search:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '6px 9px'
---

# Design System: EvalKit dashboard

## Overview

**Creative North Star: "Working surface"**

EvalKit is a black-and-white results workspace, not an eval showcase or a themed AI control room. Controls and evidence get the space; typography and single-pixel dividers establish hierarchy. The global navigation compresses to a slim rail to give a wide table more room, and its collapse control stays inside the rail. Trial inspection opens in a right-side panel over the retained run context.

**Key Characteristics:** compact rows; explicit text status; quiet table rules; monochrome shell; no ornamental data display.

## Colors

Use white for the working area, nearly black for the navigation rail and primary text, and neutral grays for quiet separation. The CSS custom properties in `src/styles.css` are the source of truth for deployed values. Text, borders and background treatment differentiate status without semantic hues: passed is filled light gray, failed is outlined, errored is inverted, and running is lightly outlined. Every status includes a word.

**The Evidence Rule.** No visual treatment should imply a score, state, or comparison not recorded in the actual reports.

## Typography

A restrained Helvetica Neue/system sans stack for titles, labels, navigation, and table content. Page titles use 23px; table cells use 13px; compact secondary labels use 11px or 12px. Monospace is reserved for IDs, paths and raw evidence. The deliberate hierarchy replaces the former blanket of tiny text. Large editorial serif headlines and monospace-for-everything are both outside this system.

## Layout

The expanded desktop shell uses a 196px navigation rail; the in-rail control compresses it to 52px in 150ms so the work area gains width. On reduced-motion systems the change is instant. Run filters sit in a 208px column beside a horizontally scrollable data table with a sticky run-ID column. At 980px, filters stack; at 740px, the expanded navigation becomes a horizontal row. At phone widths the filter disclosure starts closed and the search field takes a full row. Touch targets expand on coarse pointers without loosening desktop density.

## Elevation & Depth

No raised cards or ambient shadows. White surfaces, fine neutral borders, a subtle header shade, and one sticky-column divider organize the data.

## Shapes

Corners are nearly square (2px). Never add an illustrated product mark or color flourish to make utilitarian controls seem branded.

## Components

### Navigation

The black rail uses muted labels at rest and a restrained gray active background. Its chevron control names the action to assistive technology, exposes expanded state, and remains in place when collapsed. On phones the rail becomes a compact top bar with the same control.

### Investigation panel

Selecting a trial leaves the underlying run table and its URL filters in place. The native dialog on the right uses a short breadcrumb path from suite (or Runs, if no suite was recorded) through eval, run, trial, and candidate workspace. The workspace is nested in the same panel. Escape or the close button returns to the run. Old trial and workspace URLs remain accessible for direct links.

### Tables

Compact, sortable, and horizontally scrollable. Headers have a pale-gray ground. The first ID cell stays visible during scrolling. Status remains a distinct textual column.

### Filters and inputs

Native checkboxes and date inputs, narrow borders, visible black focus outlines. Mobile filters are a disclosure; search stretches across the available mobile width.

### Status

Small rectangular labels keep the exact state word. Running, passed, failed and errored remain discernible when printed in grayscale.

## Do's and Don'ts

### Do:

- **Do** privilege saved run identity, status, eval and trial evidence over decorative summaries.
- **Do** retain keyboard-accessible navigation and clear focus in dense layouts.
- **Do** show report states in text, never just tint.

### Don't:

- **Don't** add invented metrics or a published-eval gallery to the operations screen.
- **Don't** reintroduce green accents, gradient chrome, faux marks, or a hero-metric strip.
- **Don't** hide table columns simply to make a phone capture look tidy.
