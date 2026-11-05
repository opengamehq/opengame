/* The tables dist/avatar.js names colours from, read out of the mascot renderer and the
   outfit catalogue at build time (see build.mjs). A file rather than an inline entry so the
   SDK's input coverage test can follow these imports the way the build does. It sits
   outside src/ because it is a build input, not part of the package's types. */
export { MASCOT_COLORS } from '../ui/src/components/mascot/colors.ts';
export { RENAMED } from '../ui/src/components/mascot/look.ts';
export { CHARACTER_COLORS } from '../shared/src/character-look.ts';
