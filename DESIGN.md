schema: codex_hud_design_contract.v1
status: active
inherits: /home/amosh/Priv/Projects/DESIGN.md

scope:
  applies_to:
    - apps/buddy-bot admin browser surface
    - future codex-hud internal operator UIs

visual_language:
  name: quiet_signal_console
  intent: dense operator admin panel for monitoring and moderation
  avoid:
    - marketing hero
    - decorative gradients or orbs
    - card walls
    - full-email exposure

tokens:
  canvas: "#0B0D10"
  surface: "#11161C"
  raised: "#171D24"
  line: "rgba(178, 196, 210, 0.18)"
  text: "#F1F5F2"
  muted: "#9AA7B2"
  accent: "#7DD7BD"
  danger: "#F08C86"
  radius: 8px

components:
  admin_tables:
    rule: use dense tables for offers, seekers, matches, and metrics
    privacy: masked email only
  admin_actions:
    rule: buttons for cancel, resolve, block, config save, and exports
    minimum_target: 44px
  config_editor:
    rule: small form with explicit JSON fields for policy-sensitive remote config

verification:
  deterministic_harness: apps/buddy-bot/playwright.config.ts
  target_surface: /admin?token=<ADMIN_TOKEN>
  required_checks:
    - admin first screen renders
    - export links visible
    - config form visible
    - action buttons do not overflow
    - mobile viewport has no horizontal page overflow except table-local scroll

