# Burgundy theme preview

The reviewable theme is in `src/app/red-theme.css`, imported after the current premium styles. `red-theme` on the root body enables it. Remove that body class to return to the blue design. No database, permissions or business behavior changes are part of this theme.

Palette: primary burgundy #9b2c3e, hover #7b2030, wine navigation #2c2027, warm white #f8f6f4, charcoal text #362d34. White text on the primary button has approximately 7.44:1 contrast. Green success states and differentiated stage indicators remain meaningful rather than being recoloured red.

The palette covers the workspace navigation, record actions, forms, reports, BI chart accent, provider/plan/automation controls, public/login pages and branded hotel workspace. It uses local CSS with no added font downloads, dependencies or decorative AI effects. Hotel brand imagery remains illustrative, not a live hotel listing.

Production build and representative navigation/report/owner browser checks were run. Desktop/mobile screenshots and page-overflow checks cover 17 workspace sections and 9 public/auth routes; hotel owner/operator previews are separate local fictional fixtures.

Preview only: no push or Render deployment is authorized by asking to see the colour option. The earlier local hotel migrations/features remain separately pending; do not accidentally deploy those while reviewing a colour change.
