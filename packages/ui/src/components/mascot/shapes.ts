/**
 * The bodies: one signed distance per shape, where the face sits on each, where a hat
 * sits on each, and the markings a shape may carry in its second ink.
 *
 * See CONTRIBUTING.md in this folder before adding one. Ids are stored in rows and URLs,
 * so an id is never renamed or removed. The order is the picker's and may change.
 */

import type { MascotLook } from "./look";
import type { MascotPose } from "./render";
import type { MascotMarkTone } from "./colors";
import { facialHairDistance, joinFacialHair, type LowerFace } from "./facial-hair";
import {
  heart, length, lerp, sdCapsule, sdCone, sdEllipse, sdHexagon, sdPoly, sdPolygon, sdRing,
  sdRoundBox, sdTiltEllipse, smax, smin, star,
} from "./geometry";

export const MASCOT_SHAPES = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Rounded square" },
  { id: "slab", label: "Rounded rectangle" },
  { id: "tall", label: "Tall" },
  { id: "egg", label: "Egg" },
  { id: "pebble", label: "Pebble" },
  { id: "bean", label: "Bean" },
  { id: "drop", label: "Drop" },
  { id: "ghost", label: "Ghost" },
  { id: "puff", label: "Cloud" },
  { id: "flower", label: "Flower" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "diamond", label: "Diamond" },
  { id: "hexagon", label: "Hexagon" },
  { id: "cat", label: "Cat" },
  { id: "bear", label: "Bear" },
  { id: "sprout", label: "Sprout" },
  { id: "bunny", label: "Bunny" },
  { id: "devil", label: "Devil" },
  { id: "alien", label: "Alien" },
  { id: "mushroom", label: "Mushroom" },
  { id: "onigiri", label: "Onigiri" },
  { id: "slime", label: "Slime" },
  { id: "pear", label: "Pear" },
  { id: "spiky", label: "Spiky" },
  { id: "pill", label: "Pill" },
  { id: "dome", label: "Dome" },
  { id: "blob", label: "Blob" },
  { id: "moon", label: "Moon" },
  { id: "octagon", label: "Octagon" },
  { id: "gem", label: "Gem" },
  { id: "shield", label: "Shield" },
  { id: "lemon", label: "Lemon" },
  { id: "apple", label: "Apple" },
  { id: "pumpkin", label: "Pumpkin" },
  { id: "acorn", label: "Acorn" },
  { id: "cactus", label: "Cactus" },
  { id: "flame", label: "Flame" },
  { id: "snowman", label: "Snowman" },
  { id: "dumpling", label: "Dumpling" },
  { id: "bell", label: "Bell" },
  { id: "ufo", label: "UFO" },
  { id: "robot", label: "Robot" },
  { id: "crown", label: "Crown" },
  { id: "unicorn", label: "Unicorn" },
  { id: "fox", label: "Fox" },
  { id: "mouse", label: "Mouse" },
  { id: "frog", label: "Frog" },
  { id: "chick", label: "Chick" },
  { id: "octopus", label: "Octopus" },
  { id: "jellyfish", label: "Jellyfish" },
  { id: "pentagon", label: "Pentagon" },
  { id: "plus", label: "Plus" },
  { id: "peanut", label: "Peanut" },
  { id: "leaf", label: "Leaf" },
  { id: "shell", label: "Shell" },
  { id: "tulip", label: "Tulip" },
  { id: "penguin", label: "Penguin" },
  { id: "owl", label: "Owl" },
  { id: "pig", label: "Pig" },
  { id: "koala", label: "Koala" },
  { id: "hamster", label: "Hamster" },
  { id: "puppy", label: "Puppy" },
  { id: "bat", label: "Bat" },
  { id: "hedgehog", label: "Hedgehog" },
  { id: "axolotl", label: "Axolotl" },
  { id: "hatch", label: "Hatchling" },
  { id: "bee", label: "Bee" },
  { id: "snail", label: "Snail" },
  { id: "turtle", label: "Turtle" },
  { id: "crab", label: "Crab" },
  { id: "fish", label: "Fish" },
  { id: "whale", label: "Whale" },
  { id: "shark", label: "Shark" },
  { id: "strawberry", label: "Strawberry" },
  { id: "pineapple", label: "Pineapple" },
  { id: "cupcake", label: "Cupcake" },
  { id: "icecream", label: "Ice cream" },
  { id: "pudding", label: "Pudding" },
  { id: "toast", label: "Toast" },
  { id: "burger", label: "Burger" },
  { id: "bowl", label: "Bowl" },
  { id: "mitten", label: "Mitten" },
  { id: "tooth", label: "Tooth" },
  { id: "candle", label: "Candle" },
  { id: "bulb", label: "Light bulb" },
  { id: "mug", label: "Mug" },
  { id: "potion", label: "Potion" },
  { id: "balloon", label: "Balloon" },
  { id: "present", label: "Present" },
  { id: "padlock", label: "Padlock" },
  { id: "house", label: "House" },
  { id: "tv", label: "TV" },
  { id: "gamepad", label: "Gamepad" },
  { id: "trophy", label: "Trophy" },
  { id: "chest", label: "Chest" },
  { id: "bomb", label: "Bomb" },
  { id: "pawn", label: "Pawn" },
  { id: "spade", label: "Spade" },
  { id: "club", label: "Club" },
  { id: "wizard", label: "Wizard" },
  { id: "rocket", label: "Rocket" },
  { id: "planet", label: "Planet" },
  { id: "panda", label: "Panda" },
  { id: "ladybug", label: "Ladybug" },
  { id: "elephant", label: "Elephant" },
  { id: "lion", label: "Lion" },
  { id: "sheep", label: "Sheep" },
  { id: "cow", label: "Cow" },
  { id: "duck", label: "Duck" },
  { id: "seal", label: "Seal" },
  { id: "dragon", label: "Dragon" },
  { id: "dino", label: "Dinosaur" },
  { id: "deer", label: "Deer" },
  { id: "giraffe", label: "Giraffe" },
  { id: "monkey", label: "Monkey" },
  { id: "mole", label: "Mole" },
  { id: "squid", label: "Squid" },
  { id: "ray", label: "Manta ray" },
  { id: "butterfly", label: "Butterfly" },
  { id: "spider", label: "Spider" },
  { id: "caterpillar", label: "Caterpillar" },
  { id: "yeti", label: "Yeti" },
  { id: "goose", label: "Goose" },
  { id: "toucan", label: "Toucan" },
  { id: "parrot", label: "Parrot" },
  { id: "rhino", label: "Rhino" },
  { id: "hippo", label: "Hippo" },
  { id: "llama", label: "Llama" },
  { id: "camel", label: "Camel" },
  { id: "ram", label: "Ram" },
  { id: "walrus", label: "Walrus" },
  { id: "hen", label: "Hen" },
  { id: "squirrel", label: "Squirrel" },
  { id: "golem", label: "Golem" },
  { id: "cherry", label: "Cherry" },
  { id: "banana", label: "Banana" },
  { id: "carrot", label: "Carrot" },
  { id: "eggplant", label: "Eggplant" },
  { id: "corn", label: "Corn" },
  { id: "cookie", label: "Cookie" },
  { id: "macaron", label: "Macaron" },
  { id: "popsicle", label: "Popsicle" },
  { id: "cake", label: "Cake slice" },
  { id: "croissant", label: "Croissant" },
  { id: "boba", label: "Bubble tea" },
  { id: "pizza", label: "Pizza" },
  { id: "chili", label: "Chili" },
  { id: "grapes", label: "Grapes" },
  { id: "radish", label: "Radish" },
  { id: "popcorn", label: "Popcorn" },
  { id: "fries", label: "Fries" },
  { id: "hotdog", label: "Hot dog" },
  { id: "candy", label: "Candy" },
  { id: "teapot", label: "Teapot" },
  { id: "cauldron", label: "Cauldron" },
  { id: "bottle", label: "Bottle" },
  { id: "jar", label: "Jar" },
  { id: "hourglass", label: "Hourglass" },
  { id: "lantern", label: "Lantern" },
  { id: "umbrella", label: "Umbrella" },
  { id: "plant", label: "Potted plant" },
  { id: "globe", label: "Snow globe" },
  { id: "mailbox", label: "Mailbox" },
  { id: "cone", label: "Traffic cone" },
  { id: "hydrant", label: "Hydrant" },
  { id: "rain", label: "Rain cloud" },
  { id: "sun", label: "Sun" },
  { id: "crystal", label: "Crystal" },
  { id: "tree", label: "Tree" },
  { id: "pine", label: "Pine" },
  { id: "volcano", label: "Volcano" },
  { id: "comet", label: "Comet" },
  { id: "knight", label: "Knight" },
  { id: "ninja", label: "Ninja" },
  { id: "tower", label: "Tower" },
  { id: "lighthouse", label: "Lighthouse" },
  { id: "windmill", label: "Windmill" },
  { id: "camera", label: "Camera" },
  { id: "joystick", label: "Joystick" },
  { id: "arcade", label: "Arcade cabinet" },
  { id: "medal", label: "Medal" },
  { id: "satellite", label: "Satellite" },
  { id: "tornado", label: "Tornado" },
  { id: "stump", label: "Stump" },
  { id: "lamp", label: "Lamp" },
  { id: "alarm", label: "Alarm clock" },
  { id: "hotair", label: "Hot air balloon" },
  { id: "car", label: "Car" },
  { id: "boat", label: "Tugboat" },
  { id: "sub", label: "Submarine" },
  { id: "bone", label: "Bone" },
  { id: "sock", label: "Sock" },
  { id: "tshirt", label: "T-shirt" },
  { id: "tophat", label: "Top hat" },
  { id: "key", label: "Key" },
  { id: "raccoon", label: "Raccoon" },
  { id: "tiger", label: "Tiger" },
  { id: "koi", label: "Koi" },
  { id: "dalmatian", label: "Dalmatian" },
  { id: "zebra", label: "Zebra" },
  { id: "bust", label: "Bearded bust" },
  { id: "moptop", label: "Mop top" },
  { id: "spikecut", label: "Spiky crop" },
  { id: "sidepart", label: "Side part" },
  { id: "pompadour", label: "Pompadour" },
  { id: "sculpt", label: "Sculpted head" },
  { id: "pyramid", label: "Brick pyramid" },
  { id: "quiff", label: "Swept quiff" },
  { id: "fullbeard", label: "Full beard" },
  { id: "waves", label: "Wavy hair" },
  { id: "tache", label: "Moustache" },
  { id: "longhair", label: "Long hair" },
  { id: "longwaves", label: "Long waves" },
  { id: "deepwaves", label: "Deep waves" },
  { id: "shortfringe", label: "Short fringe" },
  { id: "shortcurls", label: "Short curls" },
  { id: "layeredfringe", label: "Layered fringe" },
  { id: "silkfringe", label: "Silk fringe" },
  { id: "shortquiff", label: "Short quiff" },
  { id: "tousled", label: "Tousled crop" },
  { id: "shavedbeard", label: "Shaved and bearded" },
  { id: "buzzcut", label: "Buzz cut" },
  { id: "crewcut", label: "Crew cut" },
  { id: "receding", label: "Receding hairline" },
  { id: "slickback", label: "Slicked back" },
  { id: "fauxhawk", label: "Faux hawk" },
  { id: "pixie", label: "Pixie cut" },
  { id: "cornrows", label: "Cornrows" },
  { id: "curtains", label: "Curtains" },
  { id: "afro", label: "Afro" },
  { id: "topknot", label: "Top knot" },
  { id: "twinbuns", label: "Space buns" },
  { id: "bob", label: "Bob" },
  { id: "lowpony", label: "Low ponytail" },
  { id: "locs", label: "Locs" },
  { id: "sideswept", label: "Side-swept long" },
  { id: "skinfade", label: "Skin fade" },
  { id: "undercut", label: "Undercut" },
  { id: "frenchcrop", label: "French crop" },
  { id: "mohawk", label: "Mohawk" },
  { id: "lob", label: "Long bob" },
  { id: "bluntbangs", label: "Blunt bangs" },
  { id: "curtainbangs", label: "Curtain bangs" },
  { id: "shag", label: "Shag" },
  { id: "longcurls", label: "Long curls" },
  { id: "afropuff", label: "Afro puff" },
  { id: "highpony", label: "High ponytail" },
  { id: "highbun", label: "High bun" },
  { id: "messybun", label: "Messy bun" },
  { id: "pigtails", label: "Pigtails" },
  { id: "boxbraids", label: "Box braids" },
  { id: "halfup", label: "Half up" },
  { id: "texturedcrop", label: "Textured crop" },
  { id: "taperedcrop", label: "Tapered crop" },
  { id: "softquiff", label: "Soft quiff" },
  { id: "curlycrop", label: "Curly crop" },
  { id: "softbob", label: "Soft bob" },
  { id: "roundbob", label: "Round bob" },
] as const;

export type MascotShapeId = (typeof MASCOT_SHAPES)[number]["id"];

/**
 * The shapes that are a person's head with its hair: Head hair on the picker's Hair tab, and
 * every head a person may get when an OG is made from their photo. Most were made for a jam
 * judge from their photo and opened to everybody, which is how this list grows: a hairstyle
 * people need is added here for all of them. The plain circle stands for a shaved or bald head.
 * The thirty-one cuts people most often have, men's and women's, joined them on 2 Nov 2026,
 * and the list runs short to long so the picker reads in that order.
 *
 * Only heads without facial hair, since 2 Nov 2026, when facial hair became its own part
 * (`facial-hair.ts`) to mix with any of these. The swept quiff, wavy hair, the moustache, the
 * full beard and the shaved and bearded head each carry a judge's own beard, so they stay in
 * the Shape grid, as do the bearded bust, the sculpted head and the brick pyramid, which are
 * one person's portrait, not a haircut.
 */
export const MASCOT_HAIRSTYLES = [
  // Short, from bald up.
  "circle", "buzzcut", "crewcut", "skinfade", "receding", "frenchcrop", "texturedcrop", "taperedcrop", "shortfringe", "shortquiff", "softquiff", "spikecut", "tousled",
  "undercut", "slickback", "sidepart", "pompadour", "fauxhawk", "mohawk", "cornrows", "shortcurls", "curlycrop", "pixie",
  // Medium.
  "curtains", "layeredfringe", "silkfringe", "moptop", "afro", "afropuff", "topknot", "highbun", "messybun", "twinbuns",
  "bob", "softbob", "roundbob", "lob", "shag",
  // Long.
  "highpony", "lowpony", "pigtails", "bluntbangs", "curtainbangs", "sideswept", "halfup", "longhair", "longwaves",
  "deepwaves", "longcurls", "locs", "boxbraids",
] as const satisfies readonly MascotShapeId[];

const PENTAGON = Array.from({ length: 5 }, (_, k) => {
  const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
  return [Math.cos(a) * 0.8, 0.1 + Math.sin(a) * 0.8] as const;
});
const CUPCAKE_WRAPPER = [[-0.62, 0.16], [0.62, 0.16], [0.46, 0.78], [-0.46, 0.78]] as const;
const PUDDING = [[-0.46, -0.4], [0.46, -0.4], [0.7, 0.6], [-0.7, 0.6]] as const;
const ROCKET_FIN = [[0.3, 0.06], [0.7, 0.56], [0.7, 0.8], [0.3, 0.6]] as const;
const SHARK_FIN = [[-0.24, 0.0], [0.18, -0.62], [0.3, 0.0]] as const;
const ROOF = [[-0.84, 0.06], [0, -0.68], [0.84, 0.06]] as const;
const DRAGON_FRILL = [[0.56, -0.12], [0.92, -0.34], [0.8, 0.0], [0.92, 0.18], [0.62, 0.3]] as const;
const SQUID_FIN = [[0.08, -0.74], [0.56, -0.4], [0.4, -0.18]] as const;
const RAY = [[-0.88, 0.12], [-0.3, -0.38], [0.3, -0.38], [0.88, 0.12], [0, 0.58]] as const;
const CAKE = [[-0.84, 0.82], [0.8, 0.82], [0.8, -0.24], [-0.84, 0.36]] as const;
const BOBA_CUP = [[-0.58, -0.1], [0.58, -0.1], [0.44, 0.8], [-0.44, 0.8]] as const;
const PIZZA = [[-0.78, -0.5], [0.78, -0.5], [0, 0.8]] as const;
const PYRAMID = [[0, -0.84], [0.84, 0.86], [-0.84, 0.86]] as const;
const POPCORN = [[-0.6, -0.06], [0.6, -0.06], [0.46, 0.81], [-0.46, 0.81]] as const;
const FRIES_BOX = [[-0.62, -0.08], [0.62, -0.08], [0.5, 0.8], [-0.5, 0.8]] as const;
const CANDY_WRAP = [[0.4, 0.3], [0.94, -0.06], [0.94, 0.66]] as const;
const LANTERN_CAP = [[-0.32, -0.5], [0.32, -0.5], [0.62, -0.24], [-0.62, -0.24]] as const;
const PLANT_POT = [[-0.6, 0.04], [0.6, 0.04], [0.48, 0.82], [-0.48, 0.82]] as const;
const GLOBE_BASE = [[-0.5, 0.5], [0.5, 0.5], [0.66, 0.83], [-0.66, 0.83]] as const;
const CRYSTAL_MID = [[-0.36, 0.82], [-0.36, -0.46], [0, -0.9], [0.36, -0.46], [0.36, 0.82]] as const;
const CRYSTAL_SIDE = [[0.2, 0.82], [0.3, -0.1], [0.62, -0.36], [0.86, -0.06], [0.84, 0.82]] as const;
const PINE_TOP = [[-0.46, -0.18], [0.46, -0.18], [0, -0.9]] as const;
const PINE_MID = [[-0.7, 0.28], [0.7, 0.28], [0, -0.5]] as const;
const PINE_LOW = [[-0.86, 0.62], [0.86, 0.62], [0, -0.08]] as const;
const VOLCANO = [[-0.92, 0.82], [0.92, 0.82], [0.32, -0.34], [-0.32, -0.34]] as const;
const GORGET = [[-0.6, 0.4], [0.6, 0.4], [0.78, 0.82], [-0.78, 0.82]] as const;
const LIGHTHOUSE = [[-0.6, 0.82], [0.6, 0.82], [0.4, -0.2], [-0.4, -0.2]] as const;
const WINDMILL = [[-0.6, 0.82], [0.6, 0.82], [0.36, -0.04], [-0.36, -0.04]] as const;
const LAMP_SHADE = [[-0.44, -0.86], [0.44, -0.86], [0.8, -0.04], [-0.8, -0.04]] as const;
const HULL = [[-0.94, 0.34], [0.94, 0.34], [0.62, 0.82], [-0.62, 0.82]] as const;
const SLEEVE = [[0.4, -0.56], [0.94, -0.2], [0.74, 0.14], [0.4, 0.0]] as const;
const RACCOON_CHEEK = [[0.56, 0.14], [0.94, 0.5], [0.52, 0.58]] as const;
const TIGER_RUFF = [[0.56, 0.0], [0.94, 0.34], [0.66, 0.36], [0.82, 0.62], [0.44, 0.6]] as const;

/* The mop's clumps: where each leaves the crown (radians, 0 straight up), how far past
   the skull it reaches and how far it leans. Uneven on purpose, because a mop that is
   combed reads as a helmet. */
const MOP_CLUMPS = [
  [-1.9, 0.16, 0.3], [-1.55, 0.24, 0.4], [-1.2, 0.2, 0.15], [-0.85, 0.3, -0.2], [-0.5, 0.22, 0.3],
  [-0.15, 0.32, -0.15], [0.18, 0.24, 0.25], [0.5, 0.31, -0.3], [0.85, 0.2, 0.2], [1.2, 0.27, -0.1],
  [1.55, 0.2, 0.3], [1.9, 0.17, -0.25],
] as const;

/** The skin under a mop top: the face below a ragged fringe, and all of the jaw. */
function mopFace(x: number, y: number) {
  const face = Math.min(sdEllipse(x, y - 0.3, 0.5, 0.56), 0.3 - y);
  return Math.max(face, -0.2 + 0.035 * Math.cos(x * 11) - y);
}

/* The crop's spikes: where each leaves the crown (radians, 0 straight up), how far it
   stands and how far it leans. Short and swept up and back, not a mop. */
const CROP_SPIKES = [
  [-1.05, 0.1, -0.35], [-0.75, 0.15, -0.3], [-0.45, 0.19, -0.2], [-0.15, 0.21, -0.1],
  [0.15, 0.2, 0.05], [0.45, 0.18, 0.15], [0.75, 0.14, 0.25], [1.05, 0.1, 0.3],
] as const;

/** The hair of a spiky crop: everything above a high, nearly level hairline, and short at the temples. */
function cropHair(x: number, y: number) {
  const top = -0.36 + 0.05 * Math.abs(x) + 0.02 * Math.cos(x * 14);
  const temples = Math.max(0.6 - Math.abs(x), y + 0.06);
  return Math.min(y - top, temples);
}

/* Ryan Hoover's supplied portrait: close brown sides, a rounded crown and a short
   fringe falling forward across the forehead. The ends are uneven locks, not spikes. */
function shortFringeHair(x: number, y: number) {
  const edge = -0.28 + 0.018 * Math.sin(x * 23 + 0.8) + 0.012 * Math.sin(x * 41) + 0.07 * x;
  const fringe = y - edge;
  const sides = Math.max(0.59 - Math.abs(x), y - 0.02);
  return Math.min(fringe, sides);
}

/* Daniel Hegedus's portrait: a short brown quiff lifted clear of the forehead,
   close sides and a clean, tapered jaw. His expression stays in the eyes, as it
   does for the other OGs. */
function shortQuiffHair(x: number, y: number) {
  const hairline = -0.35 + 0.10 * x * x + 0.035 * x;
  const sides = Math.max(0.56 - Math.abs(x), y + 0.015);
  return Math.min(y - hairline, sides);
}

const SHORT_QUIFF_LOCKS = [
  [-0.46, -0.57, -0.36, -0.78], [-0.30, -0.67, -0.12, -0.90],
  [-0.10, -0.71, 0.12, -0.98], [0.12, -0.73, 0.32, -0.95],
  [0.33, -0.67, 0.46, -0.82],
] as const;

/* Marco Gomez's selfie: short dark brown hair worn messy, the crown pushed up into
   pieces that lean every which way and a broken fringe falling over the middle of the
   brow, close at the sides so the ears show. Made for his judge card on 29 Oct 2026. */
function tousledHair(x: number, y: number) {
  const hairline = -0.32 + 0.12 * x * x + 0.025 * Math.sin(x * 19);
  const sides = Math.max(0.56 - Math.abs(x), y + 0.02);
  let hair = Math.min(y - hairline, sides);
  for (const [bx, by, tx, ty] of TOUSLED_FRINGE) hair = Math.min(hair, sdCone(x, y, bx, by, 0.085, tx, ty, 0.02));
  return hair;
}

/* Each lock as a base and a tip. The crown's lean left and right in turn, which is the
   mess; the fringe's three hang forward over the brow, longest just right of centre. */
const TOUSLED_CROWN = [
  [-0.50, -0.50, -0.66, -0.66], [-0.36, -0.62, -0.38, -0.86],
  [-0.17, -0.70, -0.06, -0.92], [0.02, -0.72, -0.12, -0.93],
  [0.20, -0.69, 0.34, -0.88], [0.38, -0.60, 0.40, -0.82],
  [0.52, -0.48, 0.68, -0.60],
] as const;
const TOUSLED_FRINGE = [
  [-0.30, -0.40, -0.20, -0.17], [-0.06, -0.42, 0.06, -0.13], [0.18, -0.40, 0.24, -0.19],
] as const;

/* Thomas Ricouard's picture: a shaved head and a full dark beard trimmed short, running
   up into the sideburns and stopping short of the ears. Made for his judge card on 29 Oct
   2026. The beard is the only marking. A stipple for the stubble on his scalp was tried
   and read as noise at 28 cells, so the scalp is skin. */
function shavedBeard(x: number, y: number) {
  const cheeks = 0.34 - 0.5 * x * x - y;
  const burns = Math.max(0.47 - Math.abs(x), Math.abs(x) - 0.58, -0.04 - y);
  return Math.min(cheeks, burns);
}

/* Soft bob: a rounded crown, wispy fringe and shoulder-length side pieces. */
function softbobHair(x: number, y: number) {
  const crown = sdEllipse(x, y + 0.2, 0.62, 0.5);
  const fringe = y - (-0.3 + 0.5 * x * x + 0.05 * Math.max(0, Math.cos(x * 16)));
  const sides = Math.min(
    sdRoundBox(x - 0.48, y - 0.22, 0.14, 0.4, 0.16),
    sdRoundBox(x + 0.48, y - 0.22, 0.14, 0.4, 0.16),
  );
  return Math.min(crown, fringe, sides);
}
function softbobSkin(x: number, y: number) {
  const fringe = -0.3 + 0.5 * x * x + 0.05 * Math.max(0, Math.cos(x * 16));
  const face = longHairFace(x, y, 0.49);
  return Math.max(fringe - y, face);
}

/* A circle joined to a shoulder-length box. Tried as a stand-in for Soft bob and taken
   off that id, because saved recipes, including Aiko's portrait, would have changed
   shape. It is its own cut. */
function roundBobBody(x: number, y: number) {
  return smin(sdEllipse(x, y, 0.68, 0.68), sdRoundBox(x, y - 0.1, 0.66, 0.62, 0.12), 0.04);
}
function roundBobHair(x: number, y: number) {
  const face = sdEllipse(x, y + 0.02, 0.36, 0.42);
  return Math.max(roundBobBody(x, y), -face);
}

/* The original judge portrait stored under slickback includes the short beard and knot.
   Keep that recipe stable while the everyday cuts remain independently selectable. */
function judgeSlickbackBody(x: number, y: number) {
  const head = sdEllipse(x, y - 0.04, 0.64, 0.74);
  const beard = sdEllipse(x, y - 0.46, 0.52, 0.40);
  const ears = sdEllipse(Math.abs(x) - 0.63, y - 0.06, 0.09, 0.17);
  const crown = sdEllipse(x, y + 0.5, 0.6, 0.36);
  const knot = sdEllipse(x, y + 0.84, 0.2, 0.12);
  return smin(smin(smin(smin(head, beard, 0.12), ears, 0.025), crown, 0.1), knot, 0.12);
}

function judgeSlickbackHair(x: number, y: number) {
  const recess = 0.05 * Math.exp(-(((Math.abs(x) - 0.4) / 0.12) ** 2));
  const top = y - (-0.46 + 0.2 * x * x - recess);
  const temples = Math.max(0.5 - Math.abs(x), y + 0.2, Math.abs(x) - 0.6);
  return Math.min(top, temples, shavedBeard(x, y));
}

/* Alex Kwon's supplied portrait has compact, tousled curls rather than the mop's
   long pointed locks. Rounded clumps break the crown and fall unevenly over the brow;
   the sides stop above the ears and leave the jaw clean. */
const SHORT_CURLS = [
  [-0.55, -0.43, 0.14, 0.19], [-0.47, -0.62, 0.14, 0.16],
  [-0.28, -0.70, 0.16, 0.15], [-0.08, -0.73, 0.14, 0.17],
  [0.10, -0.68, 0.15, 0.17], [0.29, -0.67, 0.16, 0.14],
  [0.46, -0.56, 0.16, 0.18], [0.56, -0.38, 0.13, 0.18],
  [-0.50, -0.23, 0.10, 0.17], [-0.33, -0.16, 0.10, 0.19],
  [-0.14, -0.23, 0.11, 0.16], [0.05, -0.14, 0.10, 0.18],
  [0.23, -0.23, 0.11, 0.15], [0.41, -0.19, 0.10, 0.17],
  [0.55, -0.24, 0.10, 0.15],
] as const;

function shortCurlsHair(x: number, y: number) {
  let hair = sdEllipse(x, y + 0.46, 0.60, 0.29);
  for (const [cx, cy, rx, ry] of SHORT_CURLS) {
    hair = smin(hair, sdEllipse(x - cx, y - cy, rx, ry), 0.025);
  }
  return hair;
}

/* Mandeep's supplied portrait has a full, layered crown with pointed locks swept
   across the brow, short sides and a clean angular jaw. Broad overlapping clumps
   form the crown, with three higher swept locks and an uneven pointed fringe. */
const LAYERED_CROWN = [
  [-0.50, -0.51, -0.69, -0.61, 0.12],
  [-0.35, -0.66, -0.40, -0.91, 0.15],
  [-0.10, -0.70, 0.06, -0.96, 0.16],
  [0.19, -0.65, 0.39, -0.86, 0.15],
  [0.49, -0.49, 0.68, -0.50, 0.11],
] as const;
const LAYERED_CLUMPS = [
  [-0.48, -0.49, 0.18, 0.24, -0.25], [-0.33, -0.65, 0.20, 0.20, 0.15],
  [-0.12, -0.69, 0.21, 0.17, -0.20], [0.09, -0.67, 0.21, 0.17, -0.25],
  [0.29, -0.60, 0.21, 0.18, -0.28], [0.46, -0.46, 0.17, 0.21, 0.15],
] as const;
const LAYERED_FRINGE = [
  [-0.49, -0.43, -0.57, -0.04, 0.13], [-0.36, -0.43, -0.43, -0.11, 0.14],
  [-0.24, -0.43, -0.13, -0.07, 0.15], [-0.06, -0.45, 0.09, -0.16, 0.14],
  [0.12, -0.46, 0.29, -0.24, 0.14], [0.30, -0.46, 0.48, -0.28, 0.13],
  [0.47, -0.42, 0.57, -0.05, 0.11],
] as const;
const LAYERED_LOCKS = [...LAYERED_CROWN, ...LAYERED_FRINGE];
function layeredFringeHair(x: number, y: number) {
  let crown = sdTiltEllipse(x, y, -0.04, -0.45, 0.64, 0.36, 0.08);
  for (const [cx, cy, rx, ry, tilt] of LAYERED_CLUMPS) {
    crown = smin(crown, sdTiltEllipse(x, y, cx, cy, rx, ry, tilt), 0.035);
  }
  let hair = Math.max(crown, y - (-0.36 + 0.08 * x));
  for (const [ax, ay, bx, by, radius] of LAYERED_LOCKS) {
    hair = smin(hair, sdCone(x, y, ax, ay, radius, bx, by, 0.022), 0.025);
  }
  return hair;
}

/* Octoberry's supplied portrait: a pale layered bob, a heavy diagonal fringe,
   one long left lock and a small tied fan beside the right jaw. The contours are
   grey lines on white hair, rather than the dark fill used by the other haircuts. */
const SILK_FRINGE = [
  [-0.49, -0.48, -0.48, 0.23, 0.15],
  [-0.32, -0.60, -0.25, 0.13, 0.15],
  [-0.12, -0.70, 0.05, 0.23, 0.15],
  [0.01, -0.73, 0.29, 0.12, 0.20],
  [0.12, -0.64, 0.47, 0.21, 0.19],
  [0.34, -0.47, 0.46, 0.48, 0.16],
  [-0.53, -0.27, -0.54, 0.85, 0.13],
  [-0.61, -0.17, -0.71, 0.48, 0.10],
  [0.55, 0.25, 0.81, 0.47, 0.075],
  [0.57, 0.30, 0.78, 0.64, 0.065],
  [0.55, 0.32, 0.59, 0.70, 0.065],
] as const;
function silkFringeHair(x: number, y: number) {
  const crown = sdTiltEllipse(x, y, 0, -0.40, 0.66, 0.53, -0.10);
  let hair = Math.max(crown, y - (-0.23 + 0.18 * x));
  for (const [ax, ay, bx, by, radius] of SILK_FRINGE) {
    hair = Math.min(hair, sdCone(x, y, ax, ay, radius, bx, by, 0.015));
  }
  return hair;
}
function silkFringeLines(x: number, y: number) {
  // Only the inner edge is inked. Filling the whole hair region would turn it dark.
  let line = Math.abs(silkFringeHair(x, y)) - 0.019;
  for (const [ax, ay, bx, by] of [
    [-0.20, -0.78, 0.41, -0.05], [0.02, -0.81, 0.53, 0.14],
    [0.31, -0.73, 0.60, -0.13], [-0.52, -0.52, -0.59, 0.65],
  ]) line = Math.min(line, sdCapsule(x, y, ax, ay, bx, by, 0.015));
  return line;
}

/* The side part: a longer face under short hair swept up and over to the right, a small
   quiff at the front and a few short tufts along the top, temples gone back a little and
   short sides.
   Made on 17 Oct 2026 for Keith Lucas's character on /about, from his photos, and open to
   everybody like every face in the list. */
function sidepartHairline(x: number) {
  const recess = 0.09 * Math.exp(-(((Math.abs(x) - 0.4) / 0.13) ** 2));
  return -0.34 + 0.12 * x * x - recess;
}

function sidepartHair(x: number, y: number) {
  const top = y - sidepartHairline(x);
  const sides = Math.max(0.6 - Math.abs(x), y - 0.02);
  return Math.min(top, sides);
}

/* Where the tufts start along the top of the head and how far each leans to the right. */
const SIDEPART_TUFTS = [[-0.5, 0.1], [-0.28, 0.12], [-0.05, 0.13], [0.18, 0.12], [0.4, 0.1]] as const;

/* The pompadour: a long face under thick dark hair brushed straight up off a level
   forehead into a tall, smooth front that rolls back over the crown, higher on the left
   where it is parted, and the sides cut short.
   Made on 20 Oct 2026 for Ammaar Reshi's judge card on /jam, from his photos, and open to
   everybody like every face in the list. */
function pompadourHair(x: number, y: number) {
  const top = y - (-0.3 + 0.1 * x * x + 0.025 * Math.cos(x * 13));
  const sides = Math.max(0.5 - Math.abs(x), y + 0.06);
  return Math.min(top, sides);
}

/* The swept quiff: a broad face and a square jaw under thick dark hair brushed up off the
   forehead and back, rising highest at the front and leaning to the right, the sides cut
   short and gone grey, and a short dark beard along the jaw.
   Made on 23 Oct 2026 for Serafin Sanchez's judge card on /jam, from his photo, and open
   to everybody like every face in the list. */
function quiffHair(x: number, y: number) {
  const top = y - (-0.3 + 0.1 * x * x + 0.025 * Math.cos(x * 13));
  // Narrow sideburns down the edge of the face into a short beard over the jaw and chin.
  const sides = Math.max(0.63 - Math.abs(x), y - 0.3);
  const beard = 0.44 - 0.45 * x * x - y;
  return Math.min(top, sides, beard);
}

/* The quiff's front locks: where each leaves the crest and where its tip ends, up and back. */
const QUIFF_LOCKS = [
  [-0.34, -0.66, -0.32, -0.82], [-0.12, -0.78, -0.04, -0.94], [0.12, -0.84, 0.24, -0.97], [0.34, -0.8, 0.48, -0.88],
] as const;

/** The face and square jaw of a swept quiff, without the hair. */
function quiffHead(x: number, y: number) {
  return smin(sdEllipse(x, y - 0.12, 0.7, 0.72), sdRoundBox(x, y - 0.46, 0.5, 0.3, 0.24), 0.12);
}

/* The full beard: a round face under short brown hair brushed up all over, the temples gone
   back a little, and a thick brown beard and moustache from ear to ear that makes the chin.
   Made on 23 Oct 2026 for Kenneth Loebenberg's judge card on /jam, from his photo, and open
   to everybody like every face in the list. */
const BRUSH_SPIKES = [
  [-1.1, 0.06, -0.2], [-0.82, 0.09, -0.15], [-0.55, 0.11, -0.1], [-0.27, 0.12, -0.05],
  [0, 0.12, 0], [0.27, 0.12, 0.05], [0.55, 0.11, 0.1], [0.82, 0.09, 0.15], [1.1, 0.06, 0.2],
] as const;

function fullbeardHair(x: number, y: number) {
  const recess = 0.08 * Math.exp(-(((Math.abs(x) - 0.38) / 0.12) ** 2));
  const top = y - (-0.36 + 0.08 * x * x - recess + 0.015 * Math.cos(x * 16));
  const sides = Math.max(0.58 - Math.abs(x), y - 0.12);
  const beard = 0.36 - 0.42 * x * x - y;
  return Math.min(top, sides, beard);
}

/* Wavy hair: an oval face under thick dark hair swept back off the forehead into a full,
   rounded top, falling in waves past the ears to the jaw and curling out at the ends,
   and a full dark beard and moustache with a wide grin of teeth showing through it.
   Made on 24 Oct 2026 for Meticulai's judge card on /jam, from his photo, and open to
   everybody like every face in the list. */

/** The skin of a wavy-haired face: under the hairline, between the falls of hair and above the beard. */
function wavesSkin(x: number, y: number) {
  // Swept back off a tall forehead, a little higher on the left where it parts.
  const hairline = -0.54 + 0.34 * x * x - 0.04 * x - y;
  // Round at the temples, so the opening in the hair is a face and not a slot in a mask.
  const face = sdEllipse(x, y + 0.06, 0.57, 0.64);
  const beard = y - (0.28 - 0.3 * x * x);
  return Math.max(hairline, face, beard);
}

/** The grin: a wide half-moon of teeth set in the beard under the moustache. */
function wavesGrin(x: number, y: number) {
  return Math.max(sdEllipse(x, y - 0.36, 0.21, 0.13), 0.36 - y);
}

/* The moustache: a broad face with ears under short black hair, neat and parted, combed
   across and lifted a little at the front, and a thick black moustache over the smile.
   Made on 24 Oct 2026 for Parik Patel's judge card on /jam, from his photo, and open to
   everybody like every face in the list. */
function tacheHair(x: number, y: number) {
  const top = y - (-0.3 + 0.14 * x * x + 0.012 * Math.cos(x * 15));
  const sides = Math.max(0.6 - Math.abs(x), y - 0.04);
  return Math.min(top, sides);
}

/** The moustache, two thick halves from the middle out with the ends turned down a
    little, and the smile under it. Without the smile the turned ends read as a frown. */
function tacheMoustache(x: number, y: number) {
  const side = Math.sign(x) || 1;
  const moustache = sdTiltEllipse(x, y, side * 0.15, 0.44, 0.19, 0.055, side * 0.12);
  const smile = Math.max(Math.abs(sdEllipse(x, y - 0.47, 0.17, 0.11)) - 0.022, 0.53 - y);
  return Math.min(moustache, smile);
}

/* Long hair: an oval face under long dark hair parted in the middle, falling straight
   past the jaw on both sides to the shoulders.
   Made on 25 Oct 2026 for Tina Sang's judge card on /jam, from her photo, and open to
   everybody like every face in the list. */
/** The visible face must also be the head silhouette. A larger head underneath this
 * opening leaves a dark crescent below the chin when everything outside it is hair. */
function longHairFace(x: number, y: number, width = 0.5) {
  return sdEllipse(x, y + 0.02, width, 0.64);
}
function longhairSkin(x: number, y: number) {
  // The hair meets in a shallow point at the parting and curves away over each temple.
  const hairline = -0.5 + 0.1 * Math.abs(x) + 0.42 * x * x - y;
  const face = longHairFace(x, y);
  return Math.max(hairline, face);
}

/* Long waves: an oval face under long dark hair parted on the left and swept across,
   falling in loose waves past the shoulders on both sides.
   Made on 25 Oct 2026 for Sierra Mon's judge card on /jam, from her photo, and open to
   everybody like every face in the list. */
function longwavesSkin(x: number, y: number) {
  // Higher on the left where it parts, and swept down across the forehead to the right.
  const hairline = -0.52 + 0.4 * x * x + 0.1 * (x + 0.25) - y;
  const face = longHairFace(x - 0.02, y);
  return Math.max(hairline, face);
}

/* Deep waves: an oval face under long dark hair parted in the middle and crimped into
   tight waves from the crown down, falling well past the shoulders and fanning out wider
   at the ends.
   Made on 27 Oct 2026 for Shalom Rayhamen's judge card on /jam, from her photo, and open
   to everybody like every face in the list. */
function deepwavesSkin(x: number, y: number) {
  // A centre parting, as Long hair has, meeting in a shallow point over the forehead.
  const hairline = -0.5 + 0.1 * Math.abs(x) + 0.42 * x * x - y;
  const face = longHairFace(x, y, 0.48);
  return Math.max(hairline, face);
}

/* ------------------------------------------------------------------------- *
 * Haircuts
 * ------------------------------------------------------------------------- */

/*
 * The haircuts drawn on 2 Nov 2026 for the photo OG, so a person can be matched to the cut
 * they actually have rather than the nearest judge's. Unlike the judges' faces above, none
 * of them carries a beard or a moustache: facial hair is its own layer, worn over any of
 * them, so the lower half of each face is left as skin for it.
 *
 * Each is one head and one hair: `body` is the silhouette, hair and all, and `hair` the
 * part of it drawn in the second ink. They share one face so a change of haircut moves the
 * hair and nothing else, the way a haircut does.
 */
type Haircut = { body: (x: number, y: number) => number; hair: (x: number, y: number) => number };

/** The face under every haircut: a broad oval, a rounded jaw, and ears at the eye line. */
function cutHead(x: number, y: number, width = 0.62) {
  const face = sdEllipse(x, y - 0.1, width, 0.74);
  const jaw = sdEllipse(x, y - 0.5, width * 0.66, 0.36);
  const ears = sdEllipse(Math.abs(x) - width, y - 0.12, 0.09, 0.17);
  return smin(smin(face, jaw, 0.06), ears, 0.025);
}

/** A rounded crown a little above the skull, the volume of hair worn short. */
const crown = (x: number, y: number, rise = 0.38, width = 0.66) => sdEllipse(x, y + 0.34, width, rise);

/** Hair cut close to the head: everything above `hairline`, and the sides above `temple`. */
function closeHair(x: number, y: number, hairline: number, side = 0.56, temple = 0.02) {
  return Math.min(y - hairline, Math.max(side - Math.abs(x), y - temple));
}

/** Upright tufts along the top of a crown of half-width `w` and height `rise` over -0.36. */
function crownTufts(x: number, y: number, bases: readonly number[], reach: number, w = 0.66, rise = 0.38) {
  let tufts = Infinity;
  for (const bx of bases) {
    const by = -0.34 - Math.sqrt(Math.max(0, 1 - (bx / w) ** 2)) * rise + 0.03;
    tufts = Math.min(tufts, sdCone(x, y, bx, by, 0.09, bx * 1.12, by - reach, 0.025));
  }
  return tufts;
}

const CREW_TUFTS = [-0.48, -0.3, -0.1, 0.1, 0.3, 0.48] as const;
/* The pixie's fringe, each wisp from where it leaves the crown to its tip, swept rightward. */
const PIXIE_WISPS = [[-0.46, -0.36, -0.22, -0.16], [-0.22, -0.4, 0.04, -0.15], [0.04, -0.4, 0.3, -0.17], [0.3, -0.36, 0.5, -0.12]] as const;
/* The faux hawk's ridge, as a base, a tip and a radius: the middle one tallest. */
const FAUX_RIDGE = [[-0.16, -0.62, -0.26, -0.8, 0.09], [0, -0.6, 0.05, -0.99, 0.15], [0.16, -0.62, 0.26, -0.8, 0.09]] as const;
/* Where each loc hangs from, and where it ends: longest at the back, shortest beside the face. */
const LOCS = [[0.52, 0.5], [0.66, 0.86], [0.8, 0.7]] as const;

function fauxRidge(x: number, y: number) {
  let ridge = sdEllipse(x, y + 0.6, 0.18, 0.16);
  for (const [ax, ay, bx, by, r] of FAUX_RIDGE) ridge = smin(ridge, sdCone(x, y, ax, ay, r, bx, by, 0.03), 0.04);
  return ridge;
}

/** The pixie's sides: a short point of hair in front of each ear. */
const pixieSides = (x: number, y: number) => sdCone(Math.abs(x), y, 0.56, -0.2, 0.08, 0.68, 0.1, 0.02);

/** The skin fade's top: short hair on the crown, the sides taken down to the skin. */
const fadeTop = (x: number, y: number) => sdEllipse(x, y + 0.4, 0.55, 0.32);
/** The undercut's top, long and swept over to the right past the shaved side. */
function undercutTop(x: number, y: number) {
  let top = sdTiltEllipse(x, y, 0.02, -0.56, 0.5, 0.34, -0.08);
  for (const [ax, ay, bx, by] of UNDERCUT_LOCKS) top = smin(top, sdCone(x, y, ax, ay, 0.11, bx, by, 0.03), 0.05);
  return top;
}
/** The French crop's top, cut flat and roughed up along its edge. */
const frenchTop = (x: number, y: number) => sdRoundBox(x, y + 0.48, 0.6, 0.26, 0.2) + 0.014 * Math.sin(x * 33);
/* The undercut's long top, brushed up and back in a few locks, highest a little right of centre. */
const UNDERCUT_LOCKS = [[-0.3, -0.7, -0.22, -0.9], [-0.04, -0.8, 0.1, -0.98], [0.24, -0.74, 0.4, -0.88]] as const;
const FADE_TUFTS = [-0.36, -0.18, 0, 0.18, 0.36] as const;
/** Everyday cuts from the photo references: low, soft silhouettes that stay readable at 40px. */
const TEXTURED_TUFTS = [
  [-0.48, -0.43, -0.58, -0.59], [-0.32, -0.53, -0.28, -0.72], [-0.14, -0.58, -0.04, -0.78],
  [0.04, -0.59, 0.16, -0.76], [0.23, -0.55, 0.36, -0.7], [0.4, -0.47, 0.53, -0.58],
] as const;
function texturedCropTop(x: number, y: number) {
  let top = sdEllipse(x, y + 0.4, 0.56, 0.28);
  for (const [ax, ay, bx, by] of TEXTURED_TUFTS) top = smin(top, sdCone(x, y, ax, ay, 0.105, bx, by, 0.025), 0.035);
  return top;
}
function texturedCropHair(x: number, y: number) {
  return Math.min(texturedCropTop(x, y), Math.max(y - (-0.13 + 0.08 * x * x), Math.abs(x) - 0.55));
}

/** A clean taper: a fuller top with short, gently narrowing sides and no hard fade line. */
function taperedCropTop(x: number, y: number) {
  return sdTiltEllipse(x, y, 0.06, -0.45, 0.5, 0.29, -0.05);
}
function taperedCropHair(x: number, y: number) {
  return Math.min(taperedCropTop(x, y), Math.max(y - (-0.2 + 0.1 * x * x), Math.abs(x) - 0.53));
}

/** A modest quiff: rounded volume at the front, falling into a short natural crop. */
function softQuiffTop(x: number, y: number) {
  const crown = sdTiltEllipse(x, y, -0.02, -0.44, 0.58, 0.32, -0.12);
  const front = sdTiltEllipse(x, y, -0.24, -0.66, 0.32, 0.3, -0.3);
  return smin(crown, front, 0.07);
}
function softQuiffHair(x: number, y: number) {
  return Math.min(softQuiffTop(x, y), Math.max(y - (-0.18 + 0.1 * x * x), Math.abs(x) - 0.55));
}

/** A tighter curl pattern than Short curls: round clumps with a compact, close outline. */
const CURLY_CROP_CLUMPS = [
  [-0.47, -0.43, 0.15], [-0.32, -0.57, 0.16], [-0.14, -0.63, 0.16], [0.05, -0.62, 0.16],
  [0.24, -0.58, 0.16], [0.4, -0.47, 0.15], [-0.43, -0.28, 0.13], [-0.25, -0.24, 0.14],
  [-0.06, -0.27, 0.13], [0.13, -0.25, 0.14], [0.32, -0.28, 0.13], [0.46, -0.27, 0.11],
] as const;
function curlyCropTop(x: number, y: number) {
  let top = sdEllipse(x, y + 0.37, 0.53, 0.25);
  for (const [cx, cy, r] of CURLY_CROP_CLUMPS) top = smin(top, sdEllipse(x - cx, y - cy, r, r * 0.9), 0.025);
  return top;
}
function curlyCropHair(x: number, y: number) {
  return Math.min(curlyCropTop(x, y), Math.max(y - (-0.08 + 0.06 * x * x), Math.abs(x) - 0.52));
}
/** The mohawk's crest: a narrow strip standing up along the middle of the head. */
function mohawkCrest(x: number, y: number) {
  let crest = sdEllipse(x, y + 0.64, 0.17, 0.28);
  for (const [ax, tx, ty] of [[-0.1, -0.24, -0.95], [0, 0, -0.99], [0.1, 0.24, -0.95]]) crest = smin(crest, sdCone(x, y, ax, -0.72, 0.1, tx, ty, 0.025), 0.03);
  return crest;
}
/** A long fall either side of the face to the shoulders, Long hair's own. */
const bluntFall = (x: number, y: number) => smin(sdEllipse(x, y + 0.24, 0.7, 0.52), Math.min(sdRoundBox(x - 0.56, y - 0.3, 0.2, 0.5, 0.05), sdRoundBox(x + 0.56, y - 0.3, 0.2, 0.5, 0.05)), 0.16);
const featherFall = (x: number, y: number) => smin(sdEllipse(x, y + 0.24, 0.7, 0.52), Math.min(sdTiltEllipse(x, y, -0.66, 0.4, 0.26, 0.56, 0.22), sdTiltEllipse(x, y, 0.66, 0.4, 0.26, 0.56, -0.22)), 0.2);
const longFall = (x: number, y: number) => smin(sdEllipse(x, y + 0.24, 0.7, 0.52), Math.min(sdRoundBox(x - 0.56, y - 0.36, 0.2, 0.6, 0.16), sdRoundBox(x + 0.56, y - 0.36, 0.2, 0.6, 0.16)), 0.18);
/** The face a long cut frames: an oval opening below `hairline`. */
const framedFace = (x: number, y: number, hairline: number) => Math.max(sdEllipse(x, y - 0.14, 0.5, 0.72), hairline - y);
/** The long bob's mass, to the shoulders and cut level. */
const lobMass = (x: number, y: number) => sdRoundBox(x, y, 0.72, 0.78, 0.36);
/** The shag's layered mass, choppy all round, and its ends flicked out. */
const shagMass = (x: number, y: number) => sdRoundBox(x, y + 0.08, 0.72, 0.62, 0.34) + 0.018 * Math.sin(Math.atan2(y + 0.08, x) * 13);
const shagFlicks = (x: number, y: number) => sdCone(Math.abs(x), y, 0.62, 0.38, 0.1, 0.8, 0.56, 0.05);
/** Long curls: a fall wider at the shoulders, its edge broken into small curls rather than lobes. */
const curlMass = (x: number, y: number) => smin(sdEllipse(x, y + 0.2, 0.8, 0.58), Math.min(sdTiltEllipse(x, y, -0.66, 0.36, 0.33, 0.6, 0.16), sdTiltEllipse(x, y, 0.66, 0.36, 0.33, 0.6, -0.16)), 0.2)
  + 0.03 * Math.cos(Math.atan2(y - 0.1, x) * 22);
/** The afro puff, gathered on the top of the head. */
const afroPuff = (x: number, y: number) => length(x, y + 0.56) - 0.4 + 0.026 * Math.cos(Math.atan2(y + 0.56, x) * 22);
/** The high ponytail: tied at the crown, over the top and down behind the head on the right. */
const highPony = (x: number, y: number) => smin(length(x - 0.04, y + 0.76) - 0.14, Math.min(sdCone(x, y, 0.12, -0.84, 0.13, 0.62, -0.5, 0.11), sdCone(x, y, 0.62, -0.5, 0.11, 0.74, 0.3, 0.06)), 0.05);
const highBun = (x: number, y: number) => length(x, y + 0.76) - 0.22;
/** The messy bun, pinned off to one side with pieces coming out of it. */
function messyBun(x: number, y: number) {
  let bun = length(x - 0.26, y + 0.66) - 0.19 + 0.03 * Math.sin(Math.atan2(y + 0.66, x - 0.26) * 7);
  for (const [ax, ay, bx, by] of [[0.2, -0.76, 0.04, -0.96], [0.32, -0.8, 0.46, -0.98], [0.4, -0.64, 0.62, -0.7]]) bun = Math.min(bun, sdCone(x, y, ax, ay, 0.05, bx, by, 0.015));
  return bun;
}
/** The loose pieces left down either side of the face. */
const looseStrands = (x: number, y: number) => sdCone(Math.abs(x), y, 0.5, -0.32, 0.05, 0.56, 0.18, 0.02);
/** Pigtails, tied below the ears and standing out from the head. */
const pigtails = (x: number, y: number) => smin(length(Math.abs(x) - 0.62, y - 0.02) - 0.11, sdCone(Math.abs(x), y, 0.66, 0.06, 0.14, 0.78, 0.66, 0.08), 0.04);
/** A centre parting from the hairline back to the crown. */
const parting = (x: number, y: number, from: number) => Math.max(Math.abs(x) - 0.022, y - from, -0.76 - y);
const BRAIDS = [[0.48, 0.74], [0.6, 0.9], [0.72, 0.8]] as const;
function boxBraids(x: number, y: number) {
  let braids = sdEllipse(x, y + 0.24, 0.68, 0.5);
  for (const [cx, end] of BRAIDS) {
    for (const side of [-1, 1]) {
      // Notched along its length, the plait's crossings, which is what tells a braid from a loc.
      const r = 0.065 + 0.014 * Math.abs(Math.sin(y * 30 + cx * 7));
      braids = Math.min(braids, sdCapsule(x, y, side * cx, -0.3, side * (cx + 0.02), end, r));
    }
  }
  return braids;
}
/** The half-up's knot, the top section tied on the crown. */
const halfKnot = (x: number, y: number) => length(x, y + 0.8) - 0.17;

/** Bands of half-width `half` across `s`, one every `period`. */
const bands = (s: number, period: number, half: number) => Math.abs(s - Math.round(s / period) * period) - half;

/** The bob's mass: a rounded top, straight sides, cut level at the jaw. */
const bobMass = (x: number, y: number) => sdRoundBox(x, y + 0.09, 0.7, 0.65, 0.34);
/** The low ponytail, gathered at the nape and showing beside the neck on the right. */
const lowPony = (x: number, y: number) => smin(sdCone(x, y, 0.58, -0.3, 0.18, 0.84, 0.6, 0.09), length(x - 0.62, y + 0.16) - 0.13, 0.05);
/** The afro, one round mass whose edge breaks into small curls rather than lobes. */
const afroMass = (x: number, y: number) => sdEllipse(x, y + 0.24, 0.86, 0.66) + 0.018 * Math.cos(Math.atan2(y + 0.24, x) * 18);
/** The long fall on the left of the side-swept cut, the right tucked behind the ear. */
const sweptFall = (x: number, y: number) => sdTiltEllipse(x, y, -0.62, 0.28, 0.2, 0.62, 0.1);

function locsHair(x: number, y: number) {
  let locs = sdEllipse(x, y + 0.24, 0.68, 0.5);
  for (const [cx, end] of LOCS) {
    for (const side of [-1, 1]) {
      // A slow swell along each loc, so they read as twisted ropes and not as stripes.
      const r = 0.085 + 0.008 * Math.sin(y * 24 + cx * 9);
      locs = Math.min(locs, sdCapsule(x, y, side * cx, -0.3, side * (cx + 0.03), end, r));
    }
  }
  return locs;
}

export const HAIRCUTS = {
  buzzcut: {
    body: (x, y) => smin(cutHead(x, y), crown(x, y, 0.26, 0.6), 0.06),
    hair: (x, y) => closeHair(x, y, -0.3 + 0.1 * x * x, 0.56, 0.04),
  },
  crewcut: {
    body: (x, y) => smin(smin(cutHead(x, y), crown(x, y, 0.38, 0.68), 0.06), crownTufts(x, y, CREW_TUFTS, 0.1, 0.68), 0.04),
    hair: (x, y) => Math.min(closeHair(x, y, -0.3 + 0.08 * x * x + 0.012 * Math.sin(x * 29)), crownTufts(x, y, CREW_TUFTS, 0.1, 0.68)),
  },
  texturedcrop: {
    body: (x, y) => smin(cutHead(x, y), texturedCropTop(x, y), 0.06),
    hair: (x, y) => texturedCropHair(x, y),
  },
  taperedcrop: {
    body: (x, y) => smin(cutHead(x, y), taperedCropTop(x, y), 0.06),
    hair: (x, y) => taperedCropHair(x, y),
  },
  softquiff: {
    body: (x, y) => smin(cutHead(x, y), softQuiffTop(x, y), 0.06),
    hair: (x, y) => softQuiffHair(x, y),
  },
  curlycrop: {
    body: (x, y) => smin(cutHead(x, y), curlyCropTop(x, y), 0.06),
    hair: (x, y) => curlyCropHair(x, y),
  },
  softbob: {
    body: (x, y) => smin(cutHead(x, y), softbobHair(x, y), 0.06),
    hair: (x, y) => softbobHair(x, y),
  },
  roundbob: {
    body: roundBobBody,
    hair: roundBobHair,
  },
  receding: {
    body: (x, y) => smin(cutHead(x, y), crown(x, y, 0.34, 0.66), 0.06),
    // A widow's peak in the middle, and the temples gone well back either side of it.
    hair: (x, y) => closeHair(x, y, -0.3 + 0.1 * x * x - 0.24 * Math.exp(-(((Math.abs(x) - 0.36) / 0.19) ** 2)), 0.55, 0.04),
  },
  slickback: {
    body: judgeSlickbackBody,
    hair: judgeSlickbackHair,
  },
  fauxhawk: {
    body: (x, y) => smin(smin(cutHead(x, y), crown(x, y, 0.34, 0.62), 0.06), fauxRidge(x, y), 0.06),
    hair: (x, y) => Math.min(closeHair(x, y, -0.32 + 0.1 * x * x, 0.56, -0.04), fauxRidge(x, y)),
  },
  pixie: {
    body: (x, y) => smin(smin(cutHead(x, y, 0.6), crown(x, y, 0.36, 0.64), 0.06), pixieSides(x, y), 0.03),
    // A short crop, the fringe cut into wisps swept across the brow to the right.
    hair: (x, y) => {
      let hair = closeHair(x, y, -0.36 + 0.1 * x * x, 0.55, 0.06);
      for (const [ax, ay, bx, by] of PIXIE_WISPS) hair = Math.min(hair, sdCone(x, y, ax, ay, 0.09, bx, by, 0.02));
      return Math.min(hair, pixieSides(x, y));
    },
  },
  cornrows: {
    body: (x, y) => smin(cutHead(x, y), crown(x, y, 0.3, 0.62), 0.06),
    // Rows from the hairline back over the crown, closer together the higher they go.
    hair: (x, y) => Math.max(closeHair(x, y, -0.38 + 0.1 * x * x, 0.58, -0.06), bands(x / (0.55 + 0.45 * (y + 1)), 0.2, 0.056)),
  },
  curtains: {
    body: (x, y) => smin(smin(cutHead(x, y), sdEllipse(x, y + 0.42, 0.68, 0.42), 0.06), Math.min(sdTiltEllipse(x, y, -0.6, -0.06, 0.14, 0.32, -0.1), sdTiltEllipse(x, y, 0.6, -0.06, 0.14, 0.32, 0.1)), 0.1),
    // Parted in the middle and falling away either side of the forehead to the cheekbones.
    hair: (x, y) => Math.min(y - (-0.5 + 0.75 * Math.abs(x) - 0.3 * x * x), Math.max(0.52 - Math.abs(x), y - 0.16)),
  },
  afro: {
    body: (x, y) => smin(cutHead(x, y, 0.58), afroMass(x, y), 0.06),
    hair: (x, y) => -Math.max(sdEllipse(x, y - 0.14, 0.54, 0.68), -0.3 + 0.12 * x * x - y),
  },
  topknot: {
    body: (x, y) => Math.min(smin(cutHead(x, y), crown(x, y, 0.3, 0.62), 0.06), smin(length(x, y + 0.84) - 0.14, sdRoundBox(x, y + 0.7, 0.08, 0.08, 0.03), 0.04)),
    hair: (x, y) => Math.min(closeHair(x, y, -0.3 + 0.12 * x * x), length(x, y + 0.84) - 0.14, sdRoundBox(x, y + 0.7, 0.08, 0.08, 0.03)),
  },
  twinbuns: {
    body: (x, y) => smin(smin(cutHead(x, y), crown(x, y, 0.36, 0.62), 0.06), length(Math.abs(x) - 0.42, y + 0.72) - 0.18, 0.05),
    // A centre parting between the two buns.
    hair: (x, y) => Math.max(Math.min(closeHair(x, y, -0.34 + 0.12 * x * x, 0.58, 0), length(Math.abs(x) - 0.42, y + 0.72) - 0.18), -Math.max(Math.abs(x) - 0.022, y + 0.36, -0.76 - y)),
  },
  bob: {
    body: (x, y) => smin(cutHead(x, y, 0.56), bobMass(x, y), 0.05),
    // A blunt fringe over the brow and straight sides to the jaw; the face shows between.
    hair: (x, y) => Math.max(bobMass(x, y), Math.min(-sdEllipse(x, y - 0.14, 0.5, 0.72), y + 0.16)),
  },
  lowpony: {
    body: (x, y) => Math.min(smin(cutHead(x, y), crown(x, y, 0.36), 0.06), lowPony(x, y)),
    hair: (x, y) => Math.min(closeHair(x, y, -0.38 + 0.12 * x * x, 0.58, -0.02), Math.max(lowPony(x, y), -cutHead(x, y))),
  },
  locs: {
    body: (x, y) => smin(cutHead(x, y, 0.54), locsHair(x, y), 0.04),
    hair: (x, y) => -Math.max(sdEllipse(x, y - 0.12, 0.47, 0.7), -0.42 + 0.08 * Math.abs(x) + 0.36 * x * x - y),
  },
  sideswept: {
    body: (x, y) => smin(smin(cutHead(x, y), sdTiltEllipse(x, y, 0.04, -0.42, 0.68, 0.44, 0.08), 0.06), sweptFall(x, y), 0.08),
    // Swept down over the left brow to a long fall on that side; tucked behind the right ear.
    hair: (x, y) => Math.min(y - (-0.34 + 0.12 * x * x - 0.12 * x), Math.max(sweptFall(x, y), -sdEllipse(x, y - 0.12, 0.54, 0.72)), Math.max(0.58 - x, y + 0.04)),
  },
  skinfade: {
    body: (x, y) => smin(smin(smin(cutHead(x, y), crown(x, y, 0.3, 0.6), 0.06), fadeTop(x, y), 0.05), crownTufts(x, y, FADE_TUFTS, 0.09, 0.55, 0.4), 0.03),
    hair: (x, y) => Math.min(fadeTop(x, y), crownTufts(x, y, FADE_TUFTS, 0.09, 0.55, 0.4), Math.max(y - (-0.32 + 0.08 * x * x), Math.abs(x) - 0.5)),
  },
  undercut: {
    body: (x, y) => smin(cutHead(x, y), undercutTop(x, y), 0.05),
    hair: (x, y) => Math.min(undercutTop(x, y), Math.max(y + 0.36, Math.abs(x) - 0.5)),
  },
  frenchcrop: {
    body: (x, y) => smin(cutHead(x, y), frenchTop(x, y), 0.06),
    // A short, blunt fringe cut straight across, a textured top, the sides faded short.
    hair: (x, y) => Math.min(Math.max(y + 0.18 - 0.012 * Math.sin(x * 31), Math.abs(x) - 0.5), y + 0.3, frenchTop(x, y)),
  },
  mohawk: {
    body: (x, y) => smin(smin(cutHead(x, y), crown(x, y, 0.3, 0.6), 0.06), mohawkCrest(x, y), 0.06),
    hair: (x, y) => Math.min(mohawkCrest(x, y), Math.max(Math.abs(x) - 0.16, y + 0.3)),
  },
  lob: {
    body: (x, y) => smin(cutHead(x, y, 0.56), lobMass(x, y), 0.05),
    hair: (x, y) => Math.max(lobMass(x, y), -framedFace(x, y, -0.42 + 0.1 * Math.abs(x) + 0.36 * x * x)),
  },
  bluntbangs: {
    body: (x, y) => smin(cutHead(x, y, 0.56), bluntFall(x, y), 0.05),
    hair: (x, y) => -framedFace(x, y, -0.12),
  },
  curtainbangs: {
    body: (x, y) => smin(cutHead(x, y, 0.56), featherFall(x, y), 0.05),
    // Parted in the middle and swept away to either side, long behind.
    hair: (x, y) => -framedFace(x, y, -0.46 + 0.7 * Math.abs(x) - 0.25 * x * x),
  },
  shag: {
    body: (x, y) => smin(smin(cutHead(x, y, 0.56), shagMass(x, y), 0.04), shagFlicks(x, y), 0.04),
    hair: (x, y) => Math.min(Math.max(shagMass(x, y), -framedFace(x, y, -0.16 + 0.05 * Math.abs(Math.sin(x * 12)))), shagFlicks(x, y)),
  },
  longcurls: {
    body: (x, y) => smin(cutHead(x, y, 0.56), curlMass(x, y), 0.05),
    hair: (x, y) => -framedFace(x, y, -0.44 + 0.1 * Math.abs(x) + 0.38 * x * x),
  },
  afropuff: {
    body: (x, y) => smin(smin(cutHead(x, y), crown(x, y, 0.3, 0.62), 0.06), afroPuff(x, y), 0.04),
    hair: (x, y) => Math.min(closeHair(x, y, -0.3 + 0.12 * x * x), afroPuff(x, y)),
  },
  highpony: {
    body: (x, y) => Math.min(smin(cutHead(x, y), crown(x, y, 0.3, 0.62), 0.06), highPony(x, y)),
    hair: (x, y) => Math.min(closeHair(x, y, -0.32 + 0.12 * x * x), highPony(x, y)),
  },
  highbun: {
    body: (x, y) => smin(smin(cutHead(x, y), crown(x, y, 0.3, 0.62), 0.06), highBun(x, y), 0.04),
    hair: (x, y) => Math.min(closeHair(x, y, -0.3 + 0.12 * x * x), highBun(x, y)),
  },
  messybun: {
    body: (x, y) => smin(smin(cutHead(x, y), crown(x, y, 0.32, 0.63), 0.06), messyBun(x, y), 0.04),
    hair: (x, y) => Math.min(closeHair(x, y, -0.3 + 0.12 * x * x + 0.02 * Math.sin(x * 20)), messyBun(x, y), looseStrands(x, y)),
  },
  pigtails: {
    body: (x, y) => Math.min(smin(cutHead(x, y), crown(x, y, 0.34, 0.63), 0.06), pigtails(x, y)),
    hair: (x, y) => Math.max(Math.min(closeHair(x, y, -0.32 + 0.12 * x * x), pigtails(x, y)), -parting(x, y, -0.34)),
  },
  boxbraids: {
    body: (x, y) => smin(cutHead(x, y, 0.54), boxBraids(x, y), 0.04),
    hair: (x, y) => -Math.max(sdEllipse(x, y - 0.12, 0.47, 0.7), -0.42 + 0.08 * Math.abs(x) + 0.36 * x * x - y),
  },
  halfup: {
    body: (x, y) => Math.min(smin(cutHead(x, y, 0.56), longFall(x, y), 0.05), halfKnot(x, y)),
    hair: (x, y) => Math.min(-framedFace(x, y, -0.42 + 0.36 * x * x), halfKnot(x, y)),
  },
} satisfies Record<string, Haircut>;

type HaircutId = keyof typeof HAIRCUTS;

/* The second ink each haircut is drawn in. */
const HAIRCUT_TONES: Record<HaircutId, MascotMarkTone> = {
  buzzcut: "dark", crewcut: "brown", texturedcrop: "brown", taperedcrop: "brown", softquiff: "brown", curlycrop: "dark", softbob: "brown", roundbob: "brown", skinfade: "dark", receding: "dark", cornrows: "dark", frenchcrop: "dark",
  undercut: "dark", slickback: "brown", fauxhawk: "dark", mohawk: "dark", pixie: "dark",
  curtains: "brown", afro: "dark", afropuff: "dark", topknot: "dark", highbun: "brown", messybun: "brown",
  twinbuns: "brown", bob: "dark", lob: "brown", shag: "brown",
  highpony: "dark", lowpony: "brown", pigtails: "dark", bluntbangs: "dark", curtainbangs: "brown",
  sideswept: "dark", halfup: "brown", longcurls: "dark", locs: "dark", boxbraids: "dark",
};

/** Each haircut's hair as a marking, for `MARKINGS`. */
function haircutMarkings() {
  const marks: Partial<Record<MascotShapeId, { sd: (x: number, y: number) => number; tone: MascotMarkTone }>> = {};
  for (const id of Object.keys(HAIRCUTS) as HaircutId[]) marks[id] = { sd: HAIRCUTS[id].hair, tone: HAIRCUT_TONES[id] };
  return marks;
}

export function sdShape(shape: MascotShapeId, x: number, y: number, t: number): number {
  switch (shape) {
    case "circle":
      return length(x, y) - 0.84;
    case "square":
      return sdRoundBox(x, y, 0.79, 0.79, 0.3);
    case "slab":
      return sdRoundBox(x, y - 0.1, 0.93, 0.62, 0.34);
    case "tall":
      return sdRoundBox(x, y + 0.03, 0.6, 0.88, 0.32);
    case "egg":
      return sdCone(x, y, 0, 0.2, 0.66, 0, -0.36, 0.46);
    case "pebble":
      return sdEllipse(x, y - 0.2, 0.92, 0.64);
    case "bean": {
      const s = Math.sin(t * 1.3) * 0.015;
      const a = length(x + 0.2 + s, y + 0.16) - 0.6;
      const b = length(x - 0.24 + s, y - 0.18 - s) - 0.57;
      return smin(a, b, 0.42);
    }
    case "drop":
      return sdCone(x, y, 0, 0.2, 0.66, 0, -0.74, 0.1);
    case "ghost": {
      const head = length(x, y + 0.08) - 0.76;
      const skirt = sdRoundBox(x, y - 0.32, 0.76, 0.5, 0.06);
      const hem = y - (0.74 + 0.085 * Math.cos(x * 12.5 + t * 2.2));
      return Math.max(Math.min(head, skirt), hem);
    }
    case "puff": {
      let d = length(x, y) - 0.6;
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const breathe = Math.sin(t * 1.6 + i * 1.7) * 0.012;
        d = smin(d, length(x - Math.cos(angle) * 0.46, y - Math.sin(angle) * 0.46) - (0.38 + breathe), 0.2);
      }
      return d;
    }
    case "flower": {
      let d = length(x, y - 0.04) - 0.5;
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const sway = Math.sin(t * 1.4 + i) * 0.01;
        d = smin(d, length(x - Math.cos(angle) * 0.5, y - 0.04 - Math.sin(angle) * 0.5) - (0.35 + sway), 0.06);
      }
      return d;
    }
    case "star": {
      const yy = y - 0.08;
      const angle = Math.atan2(x, -yy);
      const r = 0.64 + 0.2 * Math.cos(5 * angle);
      return (length(x, yy) - r) * 0.78;
    }
    case "heart":
      return heart(x, y + 0.03, 1.74);
    case "diamond": {
      const a = 0.78, b = 0.8;
      const d = (Math.abs(x) / a + Math.abs(y - 0.02) / b - 1) / Math.sqrt(1 / (a * a) + 1 / (b * b));
      return d - 0.12;
    }
    case "hexagon":
      return sdHexagon(x, y - 0.04, 0.66) - 0.14;
    case "cat": {
      const head = length(x, y - 0.12) - 0.74;
      const ear = Math.min(
        sdCone(x, y, -0.42, -0.26, 0.24, -0.6, -0.84, 0.06),
        sdCone(x, y, 0.42, -0.26, 0.24, 0.6, -0.84, 0.06),
      );
      return smin(head, ear, 0.08);
    }
    case "bear": {
      const head = length(x, y - 0.12) - 0.73;
      const ears = Math.min(length(x + 0.52, y + 0.48) - 0.25, length(x - 0.52, y + 0.48) - 0.25);
      return smin(head, ears, 0.08);
    }
    case "bunny": {
      const head = length(x, y - 0.24) - 0.64;
      const ear = (side: number) => {
        const ex = x - side * 0.24;
        const ey = y + 0.46;
        const c = Math.cos(side * 0.16), sn = Math.sin(side * 0.16);
        return sdEllipse(ex * c + ey * sn, -ex * sn + ey * c, 0.13, 0.38);
      };
      return smin(head, Math.min(ear(-1), ear(1)), 0.08);
    }
    case "devil": {
      const head = length(x, y - 0.06) - 0.8;
      const horns = Math.min(
        sdCone(x, y, -0.42, -0.5, 0.16, -0.62, -0.9, 0.03),
        sdCone(x, y, 0.42, -0.5, 0.16, 0.62, -0.9, 0.03),
      );
      return smin(head, horns, 0.06);
    }
    case "alien": {
      const head = sdEllipse(x, y - 0.16, 0.82, 0.7);
      const bob = Math.sin(t * 2) * 0.02;
      const stem = sdCone(x, y, 0, -0.5, 0.045, 0.1, -0.76, 0.035);
      const ball = length(x - 0.12, y + 0.84 + bob) - 0.1;
      return Math.min(head, stem, ball);
    }
    case "mushroom": {
      const cap = Math.max(sdEllipse(x, y + 0.14, 0.94, 0.62), y - 0.12);
      const stem = sdRoundBox(x, y - 0.46, 0.42, 0.4, 0.18);
      return smin(cap, stem, 0.05);
    }
    case "onigiri": {
      // Inigo Quilez's equilateral triangle, rounded, with y turned to point up.
      const r = 0.74;
      const k = Math.sqrt(3);
      let px = Math.abs(x) - r;
      let py = -(y - 0.22) + r / k;
      if (px + k * py > 0) {
        const nx = (px - k * py) / 2;
        const ny = (-k * px - py) / 2;
        px = nx;
        py = ny;
      }
      px -= Math.max(-2 * r, Math.min(0, px));
      return -length(px, py) * Math.sign(py) - 0.16;
    }
    case "slime": {
      const body = Math.max(sdEllipse(x, y - 0.12, 0.86, 0.7), y - 0.62);
      const drip = (cx: number, len: number, r: number) => sdCone(x, y, cx, 0.52, r, cx + 0.02, 0.52 + len, r * 0.72);
      const ooze = Math.sin(t * 1.7) * 0.03;
      const drips = Math.min(drip(-0.42, 0.24 + ooze, 0.1), drip(0.06, 0.3 - ooze, 0.09), drip(0.48, 0.16 + ooze, 0.08));
      return smin(body, drips, 0.06);
    }
    case "pear":
      return smin(length(x, y - 0.36) - 0.56, length(x, y + 0.26) - 0.4, 0.3);
    case "spiky": {
      const angle = Math.atan2(x, -y);
      return (length(x, y) - (0.72 + 0.09 * Math.cos(10 * angle + t * 0.6))) * 0.72;
    }
    case "pill":
      return sdRoundBox(x, y, 0.52, 0.86, 0.52);
    case "dome":
      return Math.max(sdEllipse(x, y - 0.66, 0.92, 1.4), y - 0.8) - 0.02;
    case "blob": {
      const a = Math.atan2(y - 0.04, x);
      const r = 0.74 * (1 + 0.09 * Math.cos(3 * a + 0.5 + Math.sin(t * 0.9) * 0.25) + 0.06 * Math.cos(5 * a + 1.3));
      return (length(x, y - 0.04) - r) * 0.85;
    }
    case "moon": {
      const disc = length(x, y - 0.04) - 0.82;
      const bite = length(x - 0.46, y + 0.24) - 0.66;
      return Math.max(disc, -bite);
    }
    case "octagon": {
      const ax = Math.abs(x);
      const ay = Math.abs(y - 0.02);
      return Math.max(ax, ay, (ax + ay) * Math.SQRT1_2) - 0.74;
    }
    case "gem":
      return sdPolygon(x, y, [[-0.46, -0.58], [0.46, -0.58], [0.84, -0.18], [0, 0.82], [-0.84, -0.18]]) - 0.06;
    case "shield":
      return smin(sdRoundBox(x, y + 0.3, 0.78, 0.5, 0.18), sdCone(x, y, 0, 0.02, 0.72, 0, 0.84, 0.04), 0.06);
    case "lemon":
      return smin(
        sdEllipse(x, y - 0.18, 0.72, 0.58),
        Math.min(sdCone(x, y, 0.5, 0.18, 0.22, 0.94, 0.1, 0.04), sdCone(x, y, -0.5, 0.18, 0.22, -0.94, 0.26, 0.04)),
        0.14,
      );
    case "apple": {
      const body = smin(length(x - 0.2, y - 0.14) - 0.6, length(x + 0.2, y - 0.14) - 0.6, 0.2);
      const dimple = length(x, y + 0.58) - 0.16;
      const stem = sdCapsule(x, y, 0, -0.42, 0.08, -0.82, 0.045);
      const leaf = sdEllipse((x - 0.3) * 0.86 + (y + 0.74) * 0.5, -(x - 0.3) * 0.5 + (y + 0.74) * 0.86, 0.2, 0.09);
      return Math.min(Math.max(body, -dimple), stem, leaf);
    }
    case "pumpkin": {
      let d = sdEllipse(x, y - 0.2, 0.34, 0.62);
      for (const [cx, rx] of [[-0.3, 0.4], [0.3, 0.4], [-0.6, 0.32], [0.6, 0.32]] as const) {
        d = smin(d, sdEllipse(x - cx, y - 0.24, rx, 0.56), 0.06);
      }
      return Math.min(d, sdCapsule(x, y, 0.02, -0.34, 0.1, -0.7, 0.07));
    }
    case "acorn": {
      const nut = sdCone(x, y, 0, 0.1, 0.64, 0, 0.86, 0.05);
      const cap = Math.max(sdEllipse(x, y + 0.24, 0.84, 0.46), y + 0.02);
      return Math.min(nut, cap, sdCapsule(x, y, 0, -0.66, 0.06, -0.86, 0.05));
    }
    case "cactus": {
      const body = sdRoundBox(x, y - 0.06, 0.36, 0.8, 0.36);
      const sway = Math.sin(t * 1.2) * 0.02;
      const left = Math.min(sdCapsule(x, y, -0.3, 0.22, -0.66, 0.22, 0.13), sdCapsule(x, y, -0.66, 0.22, -0.66 + sway, -0.2, 0.13));
      const right = Math.min(sdCapsule(x, y, 0.3, 0.02, 0.66, 0.02, 0.13), sdCapsule(x, y, 0.66, 0.02, 0.66 - sway, -0.44, 0.13));
      return smin(body, Math.min(left, right), 0.06);
    }
    case "flame": {
      const f = Math.sin(t * 5.3) * 0.05;
      const core = sdCone(x, y, 0, 0.34, 0.54, f, -0.86, 0.03);
      const tongue = sdCone(x, y, 0.26, 0.16, 0.22, 0.44 - f, -0.44, 0.02);
      const tongue2 = sdCone(x, y, -0.28, 0.24, 0.2, -0.42 + f, -0.26, 0.02);
      return smin(core, Math.min(tongue, tongue2), 0.12);
    }
    case "snowman":
      return smin(length(x, y - 0.38) - 0.5, length(x, y + 0.42) - 0.42, 0.08);
    case "dumpling": {
      const base = Math.max(sdEllipse(x, y - 0.42, 0.94, 0.86), y - 0.8);
      const crest = sdEllipse(x, y + 0.38, 0.22, 0.12 + 0.03 * Math.cos(x * 40));
      return smin(base, crest, 0.1);
    }
    case "bell": {
      const body = sdCone(x, y, 0, 0.36, 0.7, 0, -0.5, 0.38);
      const lip = sdRoundBox(x, y - 0.66, 0.86, 0.14, 0.1);
      const knob = length(x, y + 0.84) - 0.1;
      return Math.min(smin(body, lip, 0.08), knob);
    }
    case "ufo": {
      const dome = Math.max(length(x, y + 0.14) - 0.5, y - 0.1);
      const saucer = sdEllipse(x, y - 0.26, 0.96, 0.26);
      const glow = Math.sin(t * 2) * 0.01;
      return smin(dome, saucer - glow, 0.06);
    }
    case "robot": {
      const head = sdRoundBox(x, y - 0.12, 0.7, 0.62, 0.14);
      const ears = Math.min(sdRoundBox(x + 0.8, y - 0.12, 0.1, 0.2, 0.05), sdRoundBox(x - 0.8, y - 0.12, 0.1, 0.2, 0.05));
      const stem = sdCapsule(x, y, 0, -0.5, 0, -0.74, 0.04);
      const ball = length(x, y + 0.82 + Math.sin(t * 2.4) * 0.015) - 0.09;
      return Math.min(head, ears, stem, ball);
    }
    case "crown": {
      const head = length(x, y - 0.24) - 0.64;
      let points = sdRoundBox(x, y + 0.36, 0.56, 0.12, 0.04);
      for (const px of [-0.42, 0, 0.42]) points = Math.min(points, sdCone(x, y, px, -0.36, 0.14, px * 1.12, -0.86, 0.05));
      return Math.min(head, points);
    }
    case "unicorn": {
      const head = length(x, y - 0.14) - 0.74;
      const horn = sdCone(x, y, 0.02, -0.5, 0.14, 0.12, -0.94, 0.02);
      return smin(head, horn, 0.05);
    }
    case "fox": {
      const head = smin(length(x, y - 0.12) - 0.6, Math.min(sdEllipse(x - 0.42, y - 0.36, 0.34, 0.22), sdEllipse(x + 0.42, y - 0.36, 0.34, 0.22)), 0.1);
      const ears = Math.min(sdCone(x, y, -0.34, -0.22, 0.2, -0.7, -0.86, 0.04), sdCone(x, y, 0.34, -0.22, 0.2, 0.7, -0.86, 0.04));
      return smin(head, ears, 0.06);
    }
    case "mouse": {
      const head = length(x, y - 0.24) - 0.6;
      const ears = Math.min(length(x - 0.54, y + 0.34) - 0.34, length(x + 0.54, y + 0.34) - 0.34);
      return smin(head, ears, 0.05);
    }
    case "frog": {
      const body = sdEllipse(x, y - 0.32, 0.92, 0.54);
      const bumps = Math.min(length(x - 0.42, y + 0.18) - 0.28, length(x + 0.42, y + 0.18) - 0.28);
      return smin(body, bumps, 0.14);
    }
    case "chick": {
      const body = length(x, y - 0.14) - 0.72;
      let tuft = Infinity;
      for (const a of [-0.45, 0, 0.45]) {
        const tx = x - Math.sin(a) * 0.12;
        const ty = y + 0.7;
        tuft = Math.min(tuft, sdEllipse(tx * Math.cos(a) - ty * Math.sin(a), tx * Math.sin(a) + ty * Math.cos(a), 0.06, 0.17));
      }
      return Math.min(body, tuft);
    }
    case "octopus": {
      let d = sdEllipse(x, y + 0.06, 0.78, 0.66);
      [-0.54, -0.18, 0.18, 0.54].forEach((tx, i) => {
        d = smin(d, sdCone(x, y, tx, 0.34, 0.14, tx * 1.12 + Math.sin(t * 2.6 + i * 1.7) * 0.05, 0.84, 0.08), 0.1);
      });
      return d;
    }
    case "jellyfish": {
      let d = Math.max(sdEllipse(x, y - 0.12, 0.82, 0.74), y - 0.22);
      [-0.5, -0.25, 0, 0.25, 0.5].forEach((tx, i) => {
        const wx = x - (tx + 0.05 * Math.sin(y * 10 + t * 3 + i));
        const end = 0.82 - (i % 2) * 0.1;
        d = Math.min(d, Math.max(Math.abs(wx) - 0.045, Math.max(0.16 - y, y - end)));
      });
      return d;
    }
    case "pentagon":
      return sdPoly(x, y, PENTAGON) - 0.08;
    case "plus":
      return smin(sdRoundBox(x, y - 0.02, 0.86, 0.34, 0.16), sdRoundBox(x, y - 0.02, 0.36, 0.84, 0.16), 0.14);
    case "peanut": {
      const s = Math.sin(t * 1.2) * 0.012;
      return smin(sdEllipse(x + 0.38, y - 0.3 + s, 0.5, 0.54), sdEllipse(x - 0.38, y - 0.26 - s, 0.5, 0.58), 0.26);
    }
    case "leaf": {
      // A vesica tipped over the way a leaf lies, its stalk on the ground at the left.
      const a = 0.62 + Math.sin(t * 1.3) * 0.03;
      const c = Math.cos(a), s = Math.sin(a);
      const yy = y - 0.04;
      const px = Math.abs(x * c + yy * s);
      const py = Math.abs(-x * s + yy * c);
      const b = Math.sqrt(1 - 0.5 * 0.5);
      const blade = (py - b) * 0.5 > px * b ? length(px, py - b) : length(px + 0.5, py) - 1;
      return Math.min(blade, sdCapsule(x, y, -0.46, 0.7, -0.62, 0.84, 0.045));
    }
    case "shell": {
      // A scallop: ribs fanning from a hinge on the ground, each ending in a bump.
      const hy = y - 0.9;
      const r = length(x, hy);
      const a = Math.atan2(x, -hy);
      const rim = r - (1.5 + 0.07 * Math.abs(Math.cos(a * 14)));
      const wedge = r * Math.sin(Math.min(Math.abs(a) - 0.6, 1.2));
      const hinge = sdRoundBox(x, y - 0.74, 0.32, 0.1, 0.05);
      return smin(smax(rim * 0.9, wedge, 0.12), hinge, 0.12);
    }
    case "tulip": {
      const cup = sdEllipse(x, y - 0.02, 0.66, 0.58);
      const petals = Math.min(
        sdCone(x, y, 0, -0.12, 0.36, 0, -0.84, 0.06),
        sdCone(x, y, -0.34, 0.0, 0.32, -0.5, -0.56, 0.1),
        sdCone(x, y, 0.34, 0.0, 0.32, 0.5, -0.56, 0.1),
      );
      const sway = Math.sin(t * 1.4) * 0.02;
      const stem = sdCapsule(x, y, 0, 0.5, sway, 0.84, 0.08);
      const leaves = Math.min(sdTiltEllipse(x, y, -0.32, 0.72, 0.3, 0.11, -0.5), sdTiltEllipse(x, y, 0.32, 0.72, 0.3, 0.11, 0.5));
      return smin(smin(cup, petals, 0.08), smin(stem, leaves, 0.06), 0.08);
    }
    case "penguin": {
      const body = sdEllipse(x, y - 0.02, 0.6, 0.8);
      const flap = Math.sin(t * 2.4) * 0.06;
      const wings = Math.min(sdTiltEllipse(x, y, -0.6, 0.14, 0.12, 0.34, -0.5 - flap), sdTiltEllipse(x, y, 0.6, 0.14, 0.12, 0.34, 0.5 + flap));
      const feet = Math.min(sdEllipse(x + 0.24, y - 0.79, 0.2, 0.07), sdEllipse(x - 0.24, y - 0.79, 0.2, 0.07));
      return smin(smin(body, wings, 0.08), feet, 0.04);
    }
    case "owl": {
      // The dip in the brow is what makes it an owl and not a cat: the facial disc.
      const body = smax(sdRoundBox(x, y - 0.14, 0.7, 0.7, 0.46), -(length(x, y + 0.74) - 0.16), 0.12);
      const tufts = Math.min(sdCone(x, y, -0.5, -0.38, 0.14, -0.84, -0.66, 0.03), sdCone(x, y, 0.5, -0.38, 0.14, 0.84, -0.66, 0.03));
      const wings = Math.min(sdTiltEllipse(x, y, -0.7, 0.32, 0.15, 0.36, -0.25), sdTiltEllipse(x, y, 0.7, 0.32, 0.15, 0.36, 0.25));
      const feet = Math.min(sdEllipse(x + 0.22, y - 0.84, 0.14, 0.05), sdEllipse(x - 0.22, y - 0.84, 0.14, 0.05));
      return Math.min(smin(smin(body, tufts, 0.08), wings, 0.06), feet);
    }
    case "pig": {
      const body = sdEllipse(x, y - 0.14, 0.8, 0.6);
      // Ears that flop forward over the brow, and a tail with a curl in it.
      const ears = Math.min(sdTiltEllipse(x, y, -0.5, -0.4, 0.2, 0.13, 0.7), sdTiltEllipse(x, y, 0.5, -0.4, 0.2, 0.13, -0.7));
      let legs = Infinity;
      for (const lx of [-0.5, -0.18, 0.18, 0.5]) legs = Math.min(legs, sdRoundBox(x - lx, y - 0.76, 0.1, 0.1, 0.05));
      const tail = Math.max(sdRing(x, y, 0.88, 0.02, 0.08, 0.035), -(x - 0.84) - (y - 0.02));
      return Math.min(smin(smin(body, ears, 0.08), legs, 0.08), tail);
    }
    case "koala": {
      const head = sdEllipse(x, y - 0.24, 0.66, 0.6);
      const ex = Math.abs(x) - 0.62;
      const ey = y + 0.08;
      const ears = length(ex, ey) - (0.32 + 0.025 * Math.cos(Math.atan2(ey, ex) * 7));
      return smin(head, ears * 0.9, 0.06);
    }
    case "hamster": {
      const body = smin(length(x, y - 0.02) - 0.5, sdEllipse(x, y - 0.44, 0.86, 0.42), 0.36);
      const ears = Math.min(length(x + 0.36, y + 0.4) - 0.13, length(x - 0.36, y + 0.4) - 0.13);
      return smin(body, ears, 0.06);
    }
    case "puppy": {
      const head = length(x, y - 0.16) - 0.68;
      const flop = Math.sin(t * 1.6) * 0.03;
      return smin(head, sdTiltEllipse(Math.abs(x), y, 0.62, 0.08, 0.2, 0.42, 0.35 + flop), 0.06);
    }
    case "bat": {
      const head = length(x, y - 0.24) - 0.6;
      const ears = Math.min(sdCone(x, y, -0.3, -0.2, 0.14, -0.4, -0.62, 0.03), sdCone(x, y, 0.3, -0.2, 0.14, 0.4, -0.62, 0.03));
      const flap = Math.sin(t * 3) * 0.03;
      const wx = Math.abs(x);
      let scallop = Infinity;
      for (const sx of [0.42, 0.68, 0.94]) scallop = Math.min(scallop, length(wx - sx, y - 0.4 + flap) - 0.14);
      const wings = Math.max(sdEllipse(wx - 0.62, y - 0.1 + flap, 0.36, 0.32), -scallop);
      return smin(Math.min(head, ears), wings, 0.06);
    }
    case "hedgehog": {
      const body = Math.max(sdEllipse(x, y - 0.42, 0.84, 0.66), y - 0.84);
      // Spines round the top half only, a triangle wave in angle about the middle.
      const dy = y - 0.42;
      const a = Math.atan2(x, -dy);
      const u = a * 3.2 + 0.5 + Math.sin(t * 1.2) * 0.04;
      const saw = Math.abs(u - Math.floor(u) - 0.5) * 2;
      const spines = Math.abs(a) < 1.7 ? (length(x, dy) - (0.66 + 0.26 * (1 - saw))) * 0.6 : Infinity;
      return Math.min(body, Math.max(spines, y - 0.84));
    }
    case "axolotl": {
      const head = sdEllipse(x, y - 0.3, 0.74, 0.54);
      const sway = Math.sin(t * 2) * 0.03;
      const ax = Math.abs(x);
      let gills = Infinity;
      for (const [gx, gy] of [[0.94, 0.02], [0.88, -0.28], [0.66, -0.5]] as const) gills = Math.min(gills, sdCone(ax, y, 0.56, 0.14, 0.05, gx, gy + sway, 0.09));
      return smin(head, gills, 0.06);
    }
    case "hatch": {
      // A chick still half in its egg: the shell's broken edge is a zigzag.
      const head = length(x, y + 0.12) - 0.56;
      const u = x * 3.2 + 0.5;
      const crack = 0.02 + 0.14 * Math.abs(u - Math.floor(u) - 0.5) * 2;
      const shell = Math.max(sdEllipse(x, y - 0.4, 0.74, 0.46), (crack - y) * 0.7);
      return Math.min(head, shell);
    }
    case "bee": {
      const body = sdEllipse(x, y - 0.3, 0.78, 0.56);
      const buzz = Math.sin(t * 9) * 0.04;
      // Wings standing off the back, long and thin, so they read as wings and not ears.
      const wings = Math.min(sdTiltEllipse(x, y, -0.6, -0.3, 0.13, 0.32, 0.95 + buzz), sdTiltEllipse(x, y, 0.6, -0.3, 0.13, 0.32, -0.95 - buzz));
      const feelers = Math.min(
        sdCapsule(x, y, -0.1, -0.2, -0.18, -0.62, 0.035),
        sdCapsule(x, y, 0.1, -0.2, 0.18, -0.62, 0.035),
        length(x + 0.19, y + 0.68) - 0.07,
        length(x - 0.19, y + 0.68) - 0.07,
      );
      return Math.min(smin(body, wings, 0.04), feelers);
    }
    case "snail": {
      const shell = length(x - 0.14, y - 0.18) - 0.6;
      const foot = sdCapsule(x, y, -0.78, 0.72, 0.82, 0.72, 0.13);
      const neck = sdCone(x, y, -0.6, 0.66, 0.16, -0.7, 0.24, 0.13);
      const bob = Math.sin(t * 1.8) * 0.02;
      const horns = Math.min(
        sdCapsule(x, y, -0.74, 0.2, -0.86, -0.14 + bob, 0.035),
        sdCapsule(x, y, -0.64, 0.18, -0.6, -0.18 - bob, 0.035),
        length(x + 0.86, y + 0.16 - bob) - 0.06,
        length(x + 0.6, y + 0.2 + bob) - 0.06,
      );
      return Math.min(smin(Math.min(foot, neck), shell, 0.08), horns);
    }
    case "turtle": {
      const shell = Math.max(sdEllipse(x, y - 0.56, 0.72, 0.96), y - 0.62);
      const rim = sdRoundBox(x, y - 0.62, 0.8, 0.07, 0.07);
      const peek = Math.sin(t * 1.1) * 0.02;
      const head = length(x - 0.76 - peek, y - 0.42) - 0.17;
      const legs = Math.min(sdRoundBox(x + 0.44, y - 0.76, 0.12, 0.1, 0.05), sdRoundBox(x - 0.38, y - 0.76, 0.12, 0.1, 0.05));
      return Math.min(smin(shell, rim, 0.04), smin(head, legs, 0.04));
    }
    case "crab": {
      const body = sdEllipse(x, y - 0.42, 0.74, 0.4);
      const ax = Math.abs(x);
      const snap = Math.sin(t * 2.2) * 0.04;
      const arms = sdCapsule(ax, y, 0.5, 0.2, 0.62, -0.2, 0.07);
      const claws = Math.max(length(ax - 0.62, y + 0.42) - 0.24, -sdCone(ax, y, 0.62, -0.44, 0.01, 0.52 - snap, -0.78, 0.13));
      let legs = Infinity;
      for (const [lx, ly] of [[0.9, 0.62], [0.84, 0.82]] as const) legs = Math.min(legs, sdCapsule(ax, y, 0.56, 0.5, lx, ly, 0.045));
      return smin(body, Math.min(arms, claws, legs), 0.06);
    }
    case "fish": {
      const swish = Math.sin(t * 3) * 0.04;
      const body = sdEllipse(x + 0.16, y - 0.32, 0.68, 0.5);
      const tail = Math.max(sdCone(x, y, 0.42, 0.32, 0.05, 0.8, 0.32 + swish, 0.3), -(length(x - 1.08, y - 0.32 - swish) - 0.2));
      const fin = sdCone(x, y, -0.24, -0.1, 0.14, -0.02, -0.34, 0.04);
      return smin(body, Math.min(tail, fin), 0.08);
    }
    case "whale": {
      const body = smin(sdEllipse(x + 0.12, y - 0.36, 0.8, 0.5), sdCone(x, y, 0.42, 0.5, 0.24, 0.74, 0.0, 0.08), 0.2);
      const flukes = Math.min(sdTiltEllipse(x, y, 0.6, -0.12, 0.2, 0.08, 0.6), sdTiltEllipse(x, y, 0.88, -0.08, 0.2, 0.08, -0.6));
      const spurt = Math.sin(t * 2.6) * 0.03;
      const spout = Math.min(
        sdCapsule(x, y, -0.24, -0.24, -0.38, -0.52 - spurt, 0.04),
        sdCapsule(x, y, -0.24, -0.24, -0.22, -0.6 - spurt, 0.04),
        sdCapsule(x, y, -0.24, -0.24, -0.08, -0.52 - spurt, 0.04),
      );
      return Math.min(smin(body, flukes, 0.06), spout);
    }
    case "shark": {
      // Side on, like the fish, and told apart from it by the fin and the crescent tail.
      const swish = Math.sin(t * 2.4) * 0.03;
      const body = smin(sdCone(x, y, 0.06, 0.38, 0.46, -0.66, 0.36, 0.2), sdCone(x, y, 0.3, 0.38, 0.32, 0.7, 0.38 + swish, 0.08), 0.1);
      const fin = Math.max(sdPoly(x, y, SHARK_FIN) - 0.04, -(length(x - 0.5, y + 0.52) - 0.3));
      const tail = Math.min(sdCone(x, y, 0.66, 0.38 + swish, 0.07, 0.94, 0.04 + swish, 0.03), sdCone(x, y, 0.66, 0.38 + swish, 0.07, 0.9, 0.66 + swish, 0.03));
      const flipper = sdCone(x, y, -0.1, 0.66, 0.1, -0.3, 0.86, 0.03);
      return smin(body, Math.min(fin, tail, flipper), 0.06);
    }
    case "strawberry": {
      const berry = sdCone(x, y, 0, -0.02, 0.66, 0, 0.72, 0.14);
      let leaves = Infinity;
      for (const [lx, ly] of [[-0.52, -0.54], [-0.26, -0.84], [0.26, -0.84], [0.52, -0.54]] as const) leaves = Math.min(leaves, sdCone(x, y, 0, -0.62, 0.12, lx, ly, 0.03));
      return Math.min(smin(berry, leaves, 0.04), sdCapsule(x, y, 0, -0.66, 0.06, -0.92, 0.04));
    }
    case "pineapple": {
      const body = sdEllipse(x, y - 0.3, 0.62, 0.56);
      let crown = Infinity;
      for (const [lx, ly] of [[0, -0.92], [-0.28, -0.8], [0.28, -0.8], [-0.46, -0.52], [0.46, -0.52]] as const) crown = Math.min(crown, sdCone(x, y, 0, -0.24, 0.13, lx, ly, 0.03));
      return smin(body, crown, 0.06);
    }
    case "cupcake": {
      const wrapper = sdPoly(x, y, CUPCAKE_WRAPPER) - 0.06;
      const swirl = smin(smin(sdEllipse(x, y - 0.06, 0.82, 0.3), sdEllipse(x, y + 0.26, 0.58, 0.24), 0.1), sdCone(x, y, 0, -0.38, 0.3, 0.06, -0.74, 0.05), 0.1);
      return Math.min(wrapper, swirl, length(x - 0.08, y + 0.8) - 0.08);
    }
    case "icecream": {
      const scoop = sdEllipse(x, y + 0.2, 0.7, 0.56);
      let drips = Infinity;
      for (const [dx, dl] of [[-0.5, 0.12], [0.46, 0.18]] as const) drips = Math.min(drips, sdCapsule(x, y, dx, 0.2, dx, 0.2 + dl + Math.sin(t * 1.5 + dx * 9) * 0.02, 0.09));
      return Math.min(smin(scoop, drips, 0.08), sdCone(x, y, 0, 0.3, 0.36, 0, 0.84, 0.04));
    }
    case "pudding": {
      // A wobble that shears from the plate up, the way a pudding moves.
      const sx = x - Math.sin(t * 3) * 0.03 * (0.6 - y);
      const body = sdPoly(sx, y, PUDDING) - 0.1;
      const drips = Math.min(sdCapsule(Math.abs(sx), y, 0.52, -0.4, 0.58, -0.16, 0.06), sdCapsule(sx, y, 0.1, -0.44, 0.1, -0.3, 0.06));
      return Math.min(smin(body, drips, 0.04), sdEllipse(x, y - 0.78, 0.94, 0.08));
    }
    case "toast": {
      const crown = smin(length(x + 0.38, y + 0.26) - 0.46, length(x - 0.38, y + 0.26) - 0.46, 0.3);
      return smin(crown, sdRoundBox(x, y - 0.32, 0.7, 0.52, 0.14), 0.1);
    }
    case "burger": {
      const bun = Math.max(sdEllipse(x, y - 0.06, 0.84, 0.82), y - 0.06);
      const lettuce = sdRoundBox(x, y - 0.14 - 0.03 * Math.sin(x * 15 + t * 1.4), 0.9, 0.06, 0.05);
      const patty = sdRoundBox(x, y - 0.33, 0.86, 0.12, 0.1);
      const base = sdRoundBox(x, y - 0.66, 0.8, 0.18, 0.16);
      return Math.min(bun, lettuce, patty, base);
    }
    case "bowl": {
      const shell = Math.max(length(x, y + 0.02) - 0.88, -0.04 - y);
      let filling = Infinity;
      for (let i = 0; i < 6; i += 1) filling = Math.min(filling, length(x + 0.6 - i * 0.24, y + 0.08 + (i % 2) * 0.04) - 0.15);
      return smin(shell, filling, 0.06);
    }
    case "mitten": {
      const hand = smin(sdRoundBox(x - 0.1, y + 0.06, 0.52, 0.62, 0.5), sdRoundBox(x - 0.1, y - 0.4, 0.48, 0.2, 0.1), 0.1);
      const wave = Math.sin(t * 2) * 0.03;
      const thumb = sdCapsule(x, y, -0.36, 0.2, -0.7, -0.16 + wave, 0.18);
      return smin(smin(hand, thumb, 0.12), sdRoundBox(x - 0.1, y - 0.7, 0.56, 0.15, 0.06), 0.04);
    }
    case "tooth": {
      const crown = smax(sdRoundBox(x, y + 0.22, 0.76, 0.5, 0.42), -(length(x, y + 0.92) - 0.22), 0.12);
      const roots = Math.min(sdCone(x, y, -0.36, 0.2, 0.32, -0.3, 0.76, 0.1), sdCone(x, y, 0.36, 0.2, 0.32, 0.3, 0.76, 0.1));
      return smin(crown, roots, 0.1);
    }
    case "candle": {
      const body = sdRoundBox(x, y - 0.26, 0.56, 0.6, 0.1);
      const drip = sdCapsule(x, y, 0.5, -0.32, 0.52, -0.06, 0.07);
      const wick = sdCapsule(x, y, 0, -0.34, 0, -0.48, 0.03);
      const f = Math.sin(t * 5.3) * 0.03;
      return Math.min(smin(body, drip, 0.04), wick, sdCone(x, y, 0, -0.58, 0.14, f, -0.94, 0.02));
    }
    case "bulb": {
      const glass = smin(length(x, y + 0.18) - 0.64, sdRoundBox(x, y - 0.4, 0.3, 0.16, 0.1), 0.24);
      const yy = y - 0.68;
      const base = sdRoundBox(x, yy, 0.27 + 0.03 * Math.cos(yy * 36), 0.15, 0.05);
      return Math.min(glass, base);
    }
    case "mug": {
      const body = sdRoundBox(x + 0.14, y - 0.18, 0.62, 0.66, 0.16);
      const handle = Math.max(sdRing(x, y, 0.5, 0.16, 0.26, 0.08), 0.46 - x);
      return smin(body, handle, 0.04);
    }
    case "potion": {
      const flask = length(x, y - 0.24) - 0.62;
      const neck = sdRoundBox(x, y + 0.48, 0.17, 0.2, 0.04);
      const lip = sdRoundBox(x, y + 0.62, 0.24, 0.05, 0.04);
      const cork = sdRoundBox(x, y + 0.76, 0.14, 0.1, 0.05);
      return Math.min(smin(flask, neck, 0.1), lip, cork);
    }
    case "balloon": {
      const sway = Math.sin(t * 1.4) * 0.03;
      const ball = sdEllipse(x - sway, y + 0.16, 0.66, 0.72);
      const knot = sdCone(x, y, sway, 0.54, 0.04, sway, 0.66, 0.09);
      const string = y > 0.66 ? Math.abs(x - sway * 0.5 - 0.04 * Math.sin(y * 14)) - 0.035 : Infinity;
      return Math.min(ball, knot, string);
    }
    case "present": {
      const box = sdRoundBox(x, y - 0.42, 0.72, 0.44, 0.06);
      const lid = sdRoundBox(x, y + 0.1, 0.82, 0.12, 0.05);
      const bow = Math.min(sdTiltEllipse(x, y, -0.26, -0.4, 0.26, 0.15, 0.55), sdTiltEllipse(x, y, 0.26, -0.4, 0.26, 0.15, -0.55), length(x, y + 0.28) - 0.1);
      return Math.min(box, lid, bow);
    }
    case "padlock": {
      const body = sdRoundBox(x, y - 0.38, 0.74, 0.48, 0.16);
      const shackle = Math.max(sdRing(x, y, 0, -0.1, 0.44, 0.11), y + 0.06);
      return Math.min(body, shackle);
    }
    case "house": {
      const walls = sdRoundBox(x, y - 0.42, 0.66, 0.44, 0.06);
      const roof = sdPoly(x, y, ROOF) - 0.06;
      const chimney = sdRoundBox(x - 0.48, y + 0.42, 0.1, 0.2, 0.03);
      return Math.min(walls, roof, chimney);
    }
    case "tv": {
      const box = sdRoundBox(x, y - 0.18, 0.88, 0.58, 0.2);
      const feet = Math.min(sdRoundBox(x + 0.5, y - 0.8, 0.1, 0.06, 0.03), sdRoundBox(x - 0.5, y - 0.8, 0.1, 0.06, 0.03));
      const wiggle = Math.sin(t * 1.6) * 0.02;
      const aerial = Math.min(
        sdCapsule(x, y, -0.06, -0.42, -0.38, -0.86 + wiggle, 0.035),
        sdCapsule(x, y, 0.06, -0.42, 0.42, -0.82 - wiggle, 0.035),
        length(x, y + 0.42) - 0.1,
      );
      return Math.min(box, feet, aerial);
    }
    case "gamepad": {
      const bar = sdRoundBox(x, y - 0.22, 0.66, 0.36, 0.3);
      const grips = Math.min(sdTiltEllipse(x, y, -0.6, 0.46, 0.28, 0.38, 0.5), sdTiltEllipse(x, y, 0.6, 0.46, 0.28, 0.38, -0.5));
      const shoulders = sdRoundBox(Math.abs(x) - 0.48, y + 0.14, 0.18, 0.06, 0.06);
      return smin(smin(bar, grips, 0.16), shoulders, 0.06);
    }
    case "trophy": {
      const cup = Math.max(sdEllipse(x, y + 0.56, 0.62, 0.86), -0.66 - y);
      const handles = Math.max(sdRing(Math.abs(x), y, 0.6, -0.36, 0.2, 0.06), 0.5 - Math.abs(x));
      const stem = sdCone(x, y, 0, 0.24, 0.1, 0, 0.6, 0.14);
      const base = sdRoundBox(x, y - 0.74, 0.46, 0.12, 0.06);
      return Math.min(smin(cup, stem, 0.1), handles, base);
    }
    case "chest": {
      const base = sdRoundBox(x, y - 0.52, 0.84, 0.34, 0.08);
      const lid = Math.max(sdEllipse(x, y - 0.18, 0.88, 0.52), y - 0.2);
      return Math.min(base, lid);
    }
    case "bomb": {
      const ball = length(x, y - 0.16) - 0.7;
      const cx = x - 0.34, cy = y + 0.5;
      const c = Math.cos(0.6), s = Math.sin(0.6);
      const cap = sdRoundBox(cx * c + cy * s, -cx * s + cy * c, 0.16, 0.11, 0.04);
      const fuse = sdCapsule(x, y, 0.42, -0.58, 0.56, -0.76, 0.035);
      const spark = star(x - 0.62, y + 0.84, 0.1 + Math.sin(t * 9) * 0.02) * 0.6;
      return Math.min(ball, cap, fuse, spark);
    }
    case "pawn": {
      const head = length(x, y + 0.38) - 0.46;
      const collar = sdRoundBox(x, y - 0.1, 0.36, 0.06, 0.06);
      const body = sdCone(x, y, 0, 0.62, 0.44, 0, 0.12, 0.2);
      const base = sdRoundBox(x, y - 0.76, 0.66, 0.1, 0.08);
      return Math.min(smin(head, collar, 0.06), smin(smin(body, collar, 0.06), base, 0.1));
    }
    case "spade": {
      const blade = heart(x, -(y + 0.08), 1.4);
      const stem = Math.max(sdCone(x, y, 0, 0.3, 0.05, 0, 0.78, 0.16), y - 0.86);
      return smin(blade, stem, 0.06);
    }
    case "club": {
      const top = length(x, y + 0.36) - 0.4;
      const sides = Math.min(length(x + 0.38, y - 0.16) - 0.4, length(x - 0.38, y - 0.16) - 0.4);
      const lobes = smin(smin(top, sides, 0.2), length(x, y) - 0.3, 0.1);
      return smin(lobes, Math.max(sdCone(x, y, 0, 0.4, 0.05, 0, 0.78, 0.16), y - 0.86), 0.06);
    }
    case "wizard": {
      const head = length(x, y - 0.24) - 0.62;
      const brim = sdEllipse(x, y + 0.34, 0.84, 0.1);
      const flop = Math.sin(t * 1.3) * 0.03;
      return Math.min(head, smin(brim, sdCone(x, y, 0, -0.42, 0.44, 0.26 + flop, -0.94, 0.04), 0.04));
    }
    case "rocket": {
      const hull = sdCone(x, y, 0, 0.26, 0.5, 0, -0.62, 0.12);
      const fins = sdPoly(Math.abs(x), y, ROCKET_FIN) - 0.04;
      const nozzle = sdRoundBox(x, y - 0.78, 0.2, 0.08, 0.04);
      return Math.min(smin(hull, fins, 0.04), nozzle);
    }
    case "planet": {
      const ball = length(x, y - 0.22) - 0.62;
      const dx = x, dy = y - 0.22;
      const a = -0.32 + Math.sin(t * 0.8) * 0.02;
      const c = Math.cos(a), s = Math.sin(a);
      const ring = Math.abs(sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0.94, 0.22)) - 0.045;
      return Math.min(ball, ring);
    }
    case "panda": {
      // Wider than the bear and with smaller, higher ears, so the two still differ as
      // silhouettes; the patches are what make it a panda, and they are `MARKINGS`.
      const head = sdEllipse(x, y - 0.14, 0.82, 0.7);
      const ears = Math.min(length(x + 0.56, y + 0.46) - 0.21, length(x - 0.56, y + 0.46) - 0.21);
      return smin(head, ears, 0.06);
    }
    case "ladybug": {
      const shell = sdEllipse(x, y - 0.16, 0.86, 0.7);
      const head = sdEllipse(x, y + 0.5, 0.4, 0.24);
      const feelers = Math.min(
        sdCapsule(x, y, -0.16, -0.66, -0.3, -0.84, 0.035),
        sdCapsule(x, y, 0.16, -0.66, 0.3, -0.84, 0.035),
      );
      return Math.min(smin(shell, head, 0.08), feelers);
    }
    case "elephant": {
      const head = length(x, y - 0.1) - 0.62;
      const ears = sdTiltEllipse(Math.abs(x), y, 0.64, 0.02, 0.32, 0.44, -0.25);
      const flap = Math.sin(t * 1.8) * 0.02;
      const trunk = Math.min(sdCone(x, y, 0, 0.46, 0.2, 0.06, 0.74, 0.1), sdCapsule(x, y, 0.06, 0.76, 0.22 + flap, 0.68, 0.08));
      return smin(smin(head, ears, 0.06), trunk, 0.08);
    }
    case "lion": {
      // Ten rounded scallops: few enough that each is several cells wide at navbar size.
      const dy = y - 0.03;
      const angle = Math.atan2(x, -dy);
      const mane = (length(x, dy) - (0.74 + 0.08 * Math.cos(10 * angle))) * 0.82;
      const ears = length(Math.abs(x) - 0.5, y + 0.62) - 0.17;
      return smin(mane, ears, 0.04);
    }
    case "sheep": {
      const bx = x - 0.08, by = y - 0.12;
      const wool = (sdEllipse(bx, by, 0.76, 0.52) - 0.045 * Math.cos(13 * Math.atan2(by, bx))) * 0.8;
      const head = sdTiltEllipse(x, y, -0.66, -0.16, 0.24, 0.32, 0.3);
      const ear = sdTiltEllipse(x, y, -0.5, -0.34, 0.16, 0.07, -0.5);
      let legs = Infinity;
      for (const lx of [-0.42, -0.14, 0.3, 0.56]) legs = Math.min(legs, sdCapsule(x, y, lx, 0.5, lx, 0.78, 0.07));
      return Math.min(smin(wool, Math.min(head, ear), 0.06), legs);
    }
    case "cow": {
      const head = smin(sdRoundBox(x, y - 0.06, 0.56, 0.5, 0.4), sdEllipse(x, y - 0.56, 0.52, 0.3), 0.14);
      const ax = Math.abs(x);
      const horns = sdCone(ax, y, 0.36, -0.36, 0.12, 0.62, -0.8, 0.05);
      const ears = sdTiltEllipse(ax, y, 0.74, -0.16, 0.24, 0.1, 0.3);
      return smin(head, Math.min(horns, ears), 0.06);
    }
    case "duck": {
      const body = smin(sdEllipse(x - 0.12, y - 0.46, 0.76, 0.4), sdCone(x, y, 0.56, 0.38, 0.2, 0.88, 0.08, 0.06), 0.14);
      const head = length(x + 0.22, y + 0.2) - 0.52;
      const bill = sdTiltEllipse(x, y, -0.76, -0.12, 0.22, 0.09, -0.12);
      return smin(smin(body, head, 0.2), bill, 0.04);
    }
    case "seal": {
      const body = sdCone(x, y, 0.16, 0.42, 0.44, -0.2, -0.3, 0.36);
      const nose = sdTiltEllipse(x, y, -0.5, -0.24, 0.16, 0.1, 0.3);
      const flipper = sdTiltEllipse(x, y, -0.36, 0.66, 0.22, 0.1, -0.5);
      const tail = Math.min(sdTiltEllipse(x, y, 0.62, 0.74, 0.22, 0.09, -0.3), sdTiltEllipse(x, y, 0.7, 0.58, 0.2, 0.08, -0.9));
      return smin(body, Math.min(nose, flipper, tail), 0.08);
    }
    case "dragon": {
      const head = length(x, y - 0.14) - 0.68;
      const ax = Math.abs(x);
      const horns = sdCone(ax, y, 0.34, -0.4, 0.13, 0.66, -0.88, 0.03);
      const frill = sdPoly(ax, y, DRAGON_FRILL) - 0.02;
      return smin(head, Math.min(horns, frill), 0.06);
    }
    case "dino": {
      const body = sdEllipse(x - 0.16, y - 0.34, 0.66, 0.44);
      const neck = sdCone(x, y, -0.16, 0.16, 0.26, -0.56, -0.5, 0.15);
      const head = sdTiltEllipse(x, y, -0.66, -0.6, 0.26, 0.17, -0.2);
      const swish = Math.sin(t * 1.6) * 0.03;
      const tail = sdCone(x, y, 0.6, 0.42, 0.2, 0.96, 0.66 + swish, 0.04);
      const legs = Math.min(sdRoundBox(x + 0.2, y - 0.72, 0.12, 0.14, 0.06), sdRoundBox(x - 0.42, y - 0.72, 0.12, 0.14, 0.06));
      return smin(smin(body, Math.min(neck, tail), 0.12), Math.min(head, legs), 0.08);
    }
    case "deer": {
      const head = smin(length(x, y - 0.04) - 0.54, sdEllipse(x, y - 0.5, 0.34, 0.34), 0.2);
      const ax = Math.abs(x);
      const ears = sdTiltEllipse(ax, y, 0.6, -0.16, 0.24, 0.1, -0.4);
      const antler = Math.min(
        sdCapsule(ax, y, 0.22, -0.42, 0.46, -0.9, 0.05),
        sdCapsule(ax, y, 0.36, -0.68, 0.66, -0.72, 0.045),
        sdCapsule(ax, y, 0.3, -0.56, 0.14, -0.84, 0.04),
      );
      return Math.min(smin(head, ears, 0.06), antler);
    }
    case "giraffe": {
      const head = smin(sdEllipse(x, y + 0.04, 0.56, 0.5), sdEllipse(x, y - 0.38, 0.42, 0.32), 0.16);
      const neck = sdRoundBox(x, y - 0.66, 0.26, 0.2, 0.06);
      const ax = Math.abs(x);
      const horns = Math.min(sdCapsule(ax, y, 0.18, -0.4, 0.24, -0.76, 0.05), length(ax - 0.24, y + 0.8) - 0.09);
      const ears = sdTiltEllipse(ax, y, 0.6, -0.22, 0.2, 0.08, -0.35);
      return Math.min(smin(smin(head, neck, 0.1), ears, 0.05), horns);
    }
    case "monkey": {
      const head = length(x, y - 0.2) - 0.64;
      const ears = length(Math.abs(x) - 0.72, y - 0.12) - 0.22;
      const tuft = sdCone(x, y, 0, -0.36, 0.1, 0.08, -0.62, 0.03);
      return smin(head, Math.min(ears, tuft), 0.06);
    }
    case "mole": {
      const body = sdEllipse(x, y - 0.18, 0.64, 0.6);
      const mound = Math.max(sdEllipse(x, y - 0.86, 0.94, 0.3), y - 0.86);
      const paws = sdTiltEllipse(Math.abs(x), y, 0.64, 0.4, 0.24, 0.13, 0.5);
      const nose = length(x, y - 0.44) - 0.12;
      return Math.min(smin(body, Math.min(mound, paws), 0.06), nose);
    }
    case "squid": {
      const mantle = sdCone(x, y, 0, 0.1, 0.52, 0, -0.62, 0.1);
      const ax = Math.abs(x);
      const fins = sdPoly(ax, y, SQUID_FIN) - 0.03;
      const sway = Math.sin(t * 2.2 + ax * 4) * 0.03;
      const arms = Math.min(
        sdCapsule(ax, y, 0.12, 0.4, 0.14 + sway, 0.78, 0.07),
        sdCapsule(ax, y, 0.34, 0.36, 0.5 + sway, 0.76, 0.07),
      );
      return smin(smin(mantle, fins, 0.04), arms, 0.1);
    }
    case "ray": {
      const wings = sdPoly(x, y, RAY) - 0.08;
      const horns = sdTiltEllipse(Math.abs(x), y, 0.2, -0.42, 0.08, 0.16, 0.3);
      const flick = Math.sin(t * 2) * 0.04;
      const tail = sdCapsule(x, y, 0, 0.5, 0.08 + flick, 0.86, 0.03);
      return Math.min(smin(wings, horns, 0.04), tail);
    }
    case "butterfly": {
      const ax = Math.abs(x);
      const flap = 1 - Math.abs(Math.sin(t * 2.4)) * 0.04;
      const upper = sdTiltEllipse(ax / flap, y, 0.46, -0.16, 0.44, 0.38, 0.45) * flap;
      const lower = sdTiltEllipse(ax / flap, y, 0.34, 0.54, 0.3, 0.3, -0.4) * flap;
      const body = sdCapsule(x, y, 0, -0.38, 0, 0.66, 0.15);
      const feelers = sdCapsule(ax, y, 0.06, -0.5, 0.26, -0.88, 0.035);
      return Math.min(smin(Math.min(upper, lower), body, 0.08), feelers);
    }
    case "spider": {
      const body = length(x, y - 0.18) - 0.56;
      const ax = Math.abs(x);
      let legs = Infinity;
      for (const [ky, fy] of [[-0.3, 0.3], [0.0, 0.58], [0.3, 0.82]] as const) {
        legs = Math.min(legs, sdCapsule(ax, y, 0.4, 0.06 + ky * 0.5, 0.78, ky, 0.06), sdCapsule(ax, y, 0.78, ky, 0.88, fy, 0.06));
      }
      const thread = sdCapsule(x, y, 0, -0.36, 0, -0.94, 0.025);
      return Math.min(smin(body, legs, 0.06), thread);
    }
    case "caterpillar": {
      const wave = (k: number) => Math.sin(t * 2.4 - k) * 0.03;
      let d = length(x + 0.4, y - 0.04) - 0.5;
      for (const [cx, cy, r, k] of [[0.14, 0.5, 0.32, 1], [0.46, 0.56, 0.27, 2], [0.72, 0.62, 0.22, 3]] as const) {
        d = smin(d, length(x - cx, y - cy - wave(k)) - r, 0.12);
      }
      const feelers = Math.min(sdCapsule(x, y, -0.56, -0.4, -0.7, -0.76, 0.035), sdCapsule(x, y, -0.3, -0.42, -0.2, -0.8, 0.035));
      return Math.min(d, feelers);
    }
    case "spikecut": {
      // A broad, round face under a short crop of hair swept up into spikes.
      const head = sdEllipse(x, y - 0.12, 0.74, 0.74);
      let hair = Infinity;
      for (const [a, reach, lean] of CROP_SPIKES) {
        const bx = Math.sin(a) * 0.6, by = 0.12 - Math.cos(a) * 0.6;
        const tx = Math.sin(a + lean) * (0.62 + reach), ty = 0.12 - Math.cos(a + lean) * (0.66 + reach);
        hair = Math.min(hair, sdCone(x, y, bx, by, 0.15, tx, ty, 0.04));
      }
      return smin(head, hair, 0.04);
    }
    case "tousled": {
      const face = sdEllipse(x, y - 0.08, 0.59, 0.72);
      const jaw = sdEllipse(x, y - 0.49, 0.40, 0.36);
      const ears = sdEllipse(Math.abs(x) - 0.60, y - 0.10, 0.09, 0.17);
      const crown = sdTiltEllipse(x, y, 0, -0.50, 0.60, 0.32, 0.04);
      let locks = Infinity;
      for (const [bx, by, tx, ty] of TOUSLED_CROWN) locks = Math.min(locks, sdCone(x, y, bx, by, 0.12, tx, ty, 0.025));
      return smin(smin(smin(smin(face, jaw, 0.06), ears, 0.025), crown, 0.06), locks, 0.04);
    }
    case "shavedbeard": {
      const head = sdEllipse(x, y - 0.04, 0.64, 0.74);
      const beard = sdEllipse(x, y - 0.46, 0.52, 0.40);
      const ears = sdEllipse(Math.abs(x) - 0.63, y - 0.06, 0.09, 0.17);
      return smin(smin(head, beard, 0.12), ears, 0.025);
    }
    case "shortquiff": {
      const face = sdEllipse(x, y - 0.07, 0.60, 0.72);
      const jaw = sdEllipse(x, y - 0.49, 0.40, 0.37);
      const ears = sdEllipse(Math.abs(x) - 0.61, y - 0.10, 0.09, 0.17);
      const crown = sdTiltEllipse(x, y, 0.015, -0.53, 0.59, 0.30, -0.10);
      let locks = Infinity;
      for (const [bx, by, tx, ty] of SHORT_QUIFF_LOCKS) locks = Math.min(locks, sdCone(x, y, bx, by, 0.115, tx, ty, 0.025));
      return smin(smin(smin(smin(face, jaw, 0.06), ears, 0.025), crown, 0.06), locks, 0.04);
    }
    case "shortfringe": {
      const face = sdEllipse(x, y - 0.09, 0.65, 0.77);
      const jaw = sdTiltEllipse(x, y, 0, 0.48, 0.43, 0.38, 0);
      const crown = sdTiltEllipse(x, y, -0.025, -0.45, 0.68, 0.44, -0.06);
      const ears = Math.min(sdEllipse(x - 0.64, y - 0.08, 0.1, 0.2), sdEllipse(x + 0.64, y - 0.08, 0.1, 0.2));
      return smin(smin(smin(face, jaw, 0.06), crown, 0.055), ears, 0.03);
    }
    case "shortcurls": {
      const face = sdEllipse(x, y - 0.18, 0.58, 0.68);
      const jaw = sdEllipse(x, y - 0.52, 0.38, 0.34);
      const ears = sdEllipse(Math.abs(x) - 0.58, y - 0.12, 0.09, 0.16);
      return smin(smin(smin(face, jaw, 0.05), ears, 0.025), shortCurlsHair(x, y), 0.04);
    }
    case "silkfringe": {
      const face = sdEllipse(x, y - 0.14, 0.53, 0.58);
      return Math.min(face, silkFringeHair(x, y));
    }
    case "layeredfringe": {
      const face = sdPoly(x, y, [
        [-0.43, -0.45], [0, -0.57], [0.43, -0.45], [0.54, -0.12],
        [0.52, 0.31], [0.39, 0.60], [0.17, 0.79], [0, 0.84],
        [-0.19, 0.79], [-0.41, 0.60], [-0.53, 0.30], [-0.55, -0.12],
      ]) - 0.015;
      const ears = sdEllipse(Math.abs(x) - 0.55, y - 0.12, 0.09, 0.16);
      return smin(smin(face, ears, 0.025), layeredFringeHair(x, y), 0.035);
    }
    case "sidepart": {
      const head = sdEllipse(x, y - 0.1, 0.7, 0.8);
      const cap = sdEllipse(x + 0.03, y + 0.36, 0.75, 0.46);
      const quiff = length(x + 0.22, y + 0.74) - 0.2;
      let tufts = Infinity;
      for (const [bx, lean] of SIDEPART_TUFTS) {
        const by = -0.36 - Math.sqrt(Math.max(0, 1 - ((bx + 0.03) / 0.75) ** 2)) * 0.42;
        tufts = Math.min(tufts, sdCone(x, y, bx, by, 0.09, bx + lean, by - 0.1, 0.03));
      }
      return smin(smin(smin(head, cap, 0.08), quiff, 0.1), tufts, 0.05);
    }
    case "sculpt": {
      // A sculpted head thrown back with its mouth wide open: the upper jaw and skull
      // tipped up to the left, the crown drawn up into a point behind, and the lower jaw
      // hanging open over the neck.
      const skull = sdTiltEllipse(x, y, 0.04, -0.3, 0.66, 0.5, -0.3);
      const crown = sdTiltEllipse(x, y, 0.3, -0.5, 0.2, 0.36, 0.4);
      const jaw = sdTiltEllipse(x, y, 0, 0.3, 0.56, 0.36, 0.18);
      const neck = sdRoundBox(x - 0.1, y - 0.66, 0.32, 0.22, 0.1);
      const head = smin(smin(smin(skull, crown, 0.1), jaw, 0.16), neck, 0.12);
      const mouth = sdPolygon(x, y, [[-1.1, -0.2], [-0.2, 0.02], [-1.1, 0.1]]);
      return smax(head, -mouth, 0.05);
    }
    case "pompadour": {
      const head = sdEllipse(x, y - 0.14, 0.66, 0.74);
      // The mass of the hair, a little narrower than the face so the short sides show.
      const volume = sdTiltEllipse(x, y, 0, -0.54, 0.6, 0.36, 0.06);
      // The front, brushed up and rolled back, highest over the left eye where it parts.
      const crest = sdTiltEllipse(x, y, -0.12, -0.72, 0.4, 0.25, 0.14);
      return smin(smin(head, volume, 0.16), crest, 0.16);
    }
    case "quiff": {
      // The mass of the hair, and the front swept up off it, highest a little right of
      // centre. Narrower than the face, so the short sides show as a step under it.
      const volume = sdTiltEllipse(x, y, 0.02, -0.5, 0.56, 0.3, -0.06);
      const crest = sdTiltEllipse(x, y, 0.1, -0.7, 0.4, 0.21, -0.2);
      // A few locks along the front, swept up and back, so it reads as hair and not a hat.
      let locks = Infinity;
      for (const [bx, by, tx, ty] of QUIFF_LOCKS) locks = Math.min(locks, sdCone(x, y, bx, by, 0.08, tx, ty, 0.02));
      return smin(smin(smin(quiffHead(x, y), volume, 0.14), crest, 0.14), locks, 0.06);
    }
    case "fullbeard": {
      const head = sdEllipse(x, y - 0.04, 0.68, 0.68);
      const beard = sdEllipse(x, y - 0.46, 0.58, 0.4);
      let hair = Infinity;
      for (const [a, reach, lean] of BRUSH_SPIKES) {
        const bx = Math.sin(a) * 0.56, by = 0.04 - Math.cos(a) * 0.58;
        const tx = Math.sin(a + lean) * (0.6 + reach), ty = 0.04 - Math.cos(a + lean) * (0.62 + reach);
        hair = Math.min(hair, sdCone(x, y, bx, by, 0.12, tx, ty, 0.035));
      }
      return smin(smin(head, beard, 0.16), hair, 0.04);
    }
    case "waves": {
      const head = smin(sdEllipse(x, y - 0.1, 0.6, 0.66), sdEllipse(x, y - 0.5, 0.52, 0.36), 0.14);
      // One smooth mass swept back off the forehead, fuller over the right where it is
      // swept across, rather than curls: a wig is what lobes round the edge read as.
      let hair = smin(sdTiltEllipse(x, y, 0.03, -0.38, 0.68, 0.42, 0.06), sdTiltEllipse(x, y, 0.16, -0.6, 0.44, 0.22, -0.15), 0.14);
      // The falls down each side to the jaw, blended into the top so the outline runs
      // down in one line. A bump at the ends reads as the flaps of a hat.
      for (const side of [-1, 1]) hair = smin(hair, sdTiltEllipse(x, y, side * 0.58, 0.02, 0.2, 0.44, side * 0.1), 0.22);
      // A slow ripple round the outline, the wave in it.
      hair += 0.022 * Math.sin(Math.atan2(y + 0.1, x) * 11);
      return smin(head, hair, 0.06);
    }
    case "longhair": {
      const head = longHairFace(x, y);
      // A smooth crown, and a straight fall down each side to the shoulders, a little
      // wider at the ends where it lies on them.
      let hair = sdEllipse(x, y + 0.24, 0.7, 0.52);
      for (const side of [-1, 1]) hair = smin(hair, sdRoundBox(x - side * 0.56, y - 0.36, 0.22, 0.6, 0.16), 0.18);
      return smin(head, hair, 0.06);
    }
    case "longwaves": {
      const head = longHairFace(x - 0.02, y);
      // Fuller than the straight fall, with more of it over the right where it is swept.
      let hair = smin(sdEllipse(x + 0.02, y + 0.24, 0.72, 0.52), sdTiltEllipse(x, y, 0.2, -0.56, 0.42, 0.24, -0.2), 0.14);
      for (const side of [-1, 1]) hair = smin(hair, sdTiltEllipse(x, y, side * 0.6, 0.34, 0.27, 0.62, -side * 0.08), 0.2);
      // A slow ripple down the falls, the wave in it, and none on the crown.
      hair += 0.028 * Math.sin(y * 13) * Math.min(1, Math.max(0, y + 0.2) * 2.5);
      return smin(head, hair, 0.06);
    }
    case "deepwaves": {
      const head = longHairFace(x, y, 0.48);
      // A fuller crown than either long face, and falls that run longer and lie wider on
      // the shoulders, so the hair is widest at the bottom.
      let hair = sdEllipse(x, y + 0.22, 0.74, 0.54);
      for (const side of [-1, 1]) hair = smin(hair, sdTiltEllipse(x, y, side * 0.64, 0.38, 0.3, 0.6, -side * 0.12), 0.22);
      // The crimp, as ripples running down the outer edge of each fall rather than ridges
      // across it: ridges across read as a barrister's wig. None on the crown, and it dies
      // away at the ends, where a ripple past the tip prints as a loose pixel.
      const fall = Math.min(1, Math.max(0, y + 0.3) * 2.5, Math.max(0, 0.96 - y) * 5);
      hair += 0.034 * Math.sin(y * 19 + Math.abs(x) * 6) * fall;
      return smin(head, hair, 0.06);
    }
    case "tache": {
      const head = sdEllipse(x, y - 0.12, 0.68, 0.74);
      const ears = sdEllipse(Math.abs(x) - 0.68, y - 0.16, 0.09, 0.15);
      // The hair, close to the head and combed across, with the front lifted on the left.
      // Narrower than the head at the sides, so it sits close like cut hair, not like a beret.
      const hair = smin(sdTiltEllipse(x, y, 0.02, -0.36, 0.64, 0.36, -0.04), length(x + 0.18, y + 0.62) - 0.2, 0.14);
      return smin(smin(head, ears, 0.06), hair, 0.08);
    }
    case "buzzcut":
    case "crewcut":
    case "texturedcrop":
    case "taperedcrop":
    case "softquiff":
    case "curlycrop":
    case "receding":
    case "slickback":
    case "fauxhawk":
    case "pixie":
    case "cornrows":
    case "curtains":
    case "afro":
    case "topknot":
    case "twinbuns":
    case "bob":
    case "lowpony":
    case "locs":
    case "sideswept":
    case "skinfade":
    case "undercut":
    case "frenchcrop":
    case "mohawk":
    case "lob":
    case "bluntbangs":
    case "curtainbangs":
    case "shag":
    case "longcurls":
    case "afropuff":
    case "highpony":
    case "highbun":
    case "messybun":
    case "pigtails":
    case "boxbraids":
    case "halfup":
    case "roundbob":
      return HAIRCUTS[shape].body(x, y);
    case "softbob": {
      const head = longHairFace(x, y, 0.49);
      // Aiko Dai's portrait stays on this id: a round crown and shoulder-length falls.
      // The circle-and-box outline that replaced it for a while is roundbob.
      let hair = sdEllipse(x, y + 0.2, 0.7, 0.54);
      for (const side of [-1, 1]) hair = smin(hair, sdRoundBox(x - side * 0.54, y - 0.22, 0.22, 0.44, 0.2), 0.18);
      return smin(head, hair, 0.06);
    }
    case "moptop": {
      // A long face under a big, messy mop of curls: clumps out of the crown at odd
      // lengths and angles, and hair down past the ears.
      const head = sdEllipse(x, y - 0.26, 0.6, 0.6);
      let hair = sdEllipse(x, y + 0.2, 0.7, 0.48);
      for (const [a, reach, lean] of MOP_CLUMPS) {
        const bx = Math.sin(a) * 0.55, by = -0.12 - Math.cos(a) * 0.38;
        const tx = Math.sin(a + lean * 0.5) * (0.62 + reach), ty = Math.max(-0.12 - Math.cos(a + lean * 0.5) * (0.42 + reach), -0.94);
        hair = Math.min(hair, sdCone(x, y, bx, by, 0.17, tx, ty, 0.06));
      }
      return smin(head, hair, 0.05);
    }
    case "pyramid": {
      // SuperTrip64's picture: a pyramid of green bricks with one great eye, its point a
      // little blunt, the way the drawing has it. The bricks are the markings below, so
      // any colour keeps them.
      return smax(sdPoly(x, y, PYRAMID) - 0.08, y - 0.76, 0.04);
    }
    case "bust": {
      // A carved head with a rounded hairline and a long beard, without ears or limbs.
      const head = sdEllipse(x, y + 0.19, 0.61, 0.61);
      const hair = sdEllipse(x + 0.025, y + 0.57, 0.62, 0.26);
      const beard = sdCone(x, y, 0, 0.18, 0.53, 0, 0.72, 0.13);
      const curls = 0.025 * Math.cos(x * 35) * Math.max(0, Math.min(1, (y - 0.25) * 3));
      return smin(smin(head, hair, 0.06), beard - curls, 0.07);
    }
    case "yeti": {
      const shag = 0.04 * Math.max(0, Math.cos(y * 20)) * Math.min(1, Math.abs(x) * 2);
      const body = sdRoundBox(x, y - 0.1, 0.62, 0.74, 0.5) - shag;
      const wave = Math.sin(t * 2) * 0.04;
      const arms = sdCone(Math.abs(x), y, 0.52, 0.1, 0.18, 0.84, -0.42 - wave, 0.14);
      const horns = sdCone(Math.abs(x), y, 0.3, -0.56, 0.1, 0.4, -0.86, 0.03);
      return smin(body, Math.min(arms, horns), 0.08);
    }
    case "goose": {
      const body = smin(sdEllipse(x - 0.14, y - 0.42, 0.74, 0.44), sdCone(x, y, 0.6, 0.36, 0.2, 0.92, 0.14, 0.05), 0.1);
      const neck = sdCone(x, y, -0.3, 0.26, 0.22, -0.46, -0.46, 0.15);
      const head = length(x + 0.46, y + 0.56) - 0.24;
      const beak = sdTiltEllipse(x, y, -0.76, -0.5, 0.18, 0.07, -0.1);
      return smin(smin(body, neck, 0.16), Math.min(head, beak), 0.05);
    }
    case "toucan": {
      const body = sdEllipse(x - 0.2, y - 0.2, 0.6, 0.64);
      const beak = sdCone(x, y, -0.32, -0.12, 0.25, -0.94, 0.12, 0.05);
      const tail = sdCone(x, y, 0.5, 0.6, 0.14, 0.62, 0.78, 0.07);
      return smin(smin(body, beak, 0.06), tail, 0.06);
    }
    case "parrot": {
      const body = sdEllipse(x - 0.06, y - 0.1, 0.58, 0.62);
      const beak = Math.max(length(x + 0.52, y + 0.12) - 0.2, -(length(x + 0.62, y - 0.04) - 0.1));
      const sway = Math.sin(t * 1.6) * 0.03;
      const crest = Math.min(sdCapsule(x, y, 0, -0.42, -0.06 + sway, -0.9, 0.06), sdCapsule(x, y, 0.12, -0.42, 0.24 + sway, -0.84, 0.06));
      const tail = sdCone(x, y, 0.24, 0.5, 0.18, 0.44, 0.84, 0.06);
      return smin(smin(body, Math.min(beak, tail), 0.08), crest, 0.06);
    }
    case "rhino": {
      const body = sdEllipse(x - 0.14, y - 0.3, 0.7, 0.46);
      const head = sdCone(x, y, -0.36, 0.22, 0.32, -0.78, 0.44, 0.2);
      const horn = Math.min(sdCone(x, y, -0.76, 0.28, 0.12, -0.84, -0.12, 0.02), sdCone(x, y, -0.5, 0.0, 0.08, -0.5, -0.22, 0.02));
      const ear = sdTiltEllipse(x, y, -0.3, -0.16, 0.06, 0.13, -0.3);
      const legs = Math.min(sdRoundBox(x + 0.3, y - 0.72, 0.13, 0.14, 0.05), sdRoundBox(x - 0.44, y - 0.72, 0.13, 0.14, 0.05));
      return smin(smin(body, head, 0.14), Math.min(horn, ear, legs), 0.06);
    }
    case "hippo": {
      const head = sdEllipse(x, y + 0.04, 0.62, 0.5);
      const muzzle = sdEllipse(x, y - 0.46, 0.84, 0.38);
      const ax = Math.abs(x);
      const bumps = Math.min(length(ax - 0.28, y + 0.46) - 0.16, length(ax - 0.5, y + 0.52) - 0.09);
      return smin(smin(head, muzzle, 0.2), bumps, 0.06);
    }
    case "llama": {
      const head = sdEllipse(x, y + 0.2, 0.52, 0.5);
      const neck = sdCone(x, y, 0, 0.42, 0.44, 0, 0.0, 0.32);
      const ears = sdTiltEllipse(Math.abs(x), y, 0.32, -0.76, 0.09, 0.22, 0.22);
      return smin(smin(head, neck, 0.12), ears, 0.06);
    }
    case "camel": {
      const body = sdEllipse(x - 0.12, y - 0.3, 0.66, 0.36);
      const humps = Math.min(length(x + 0.12, y + 0.04) - 0.3, length(x - 0.38, y + 0.04) - 0.3);
      const neck = sdCone(x, y, -0.46, 0.3, 0.16, -0.76, -0.26, 0.12);
      const head = sdTiltEllipse(x, y, -0.8, -0.3, 0.18, 0.12, 0.2);
      const legs = Math.min(sdCapsule(x, y, -0.3, 0.5, -0.32, 0.78, 0.08), sdCapsule(x, y, 0.42, 0.5, 0.44, 0.78, 0.08));
      return smin(smin(body, humps, 0.16), Math.min(neck, head, legs), 0.08);
    }
    case "ram": {
      const head = length(x, y - 0.22) - 0.62;
      const ax = Math.abs(x);
      const horns = sdRing(ax, y, 0.64, 0.04, 0.2, 0.09);
      return smin(head, horns, 0.08);
    }
    case "walrus": {
      const body = sdEllipse(x, y - 0.0, 0.7, 0.62);
      const muzzle = sdEllipse(x, y - 0.42, 0.5, 0.22);
      const ax = Math.abs(x);
      const tusks = sdCone(ax, y, 0.18, 0.5, 0.07, 0.22, 0.82, 0.03);
      const flippers = sdTiltEllipse(ax, y, 0.56, 0.6, 0.28, 0.13, -0.5);
      return smin(smin(body, muzzle, 0.12), Math.min(tusks, flippers), 0.1);
    }
    case "hen": {
      const body = length(x, y - 0.1) - 0.64;
      const legs = sdCapsule(Math.abs(x), y, 0.2, 0.7, 0.24, 0.8, 0.065);
      const comb = Math.min(length(x + 0.16, y + 0.58) - 0.12, length(x - 0.04, y + 0.66) - 0.13, length(x - 0.24, y + 0.58) - 0.12);
      const tail = sdTiltEllipse(x, y, 0.64, -0.16, 0.3, 0.13, -0.9);
      const beak = sdTiltEllipse(x, y, -0.66, -0.1, 0.14, 0.08, 0.2);
      return Math.min(smin(body, Math.min(comb, tail, beak), 0.06), legs);
    }
    case "squirrel": {
      const body = smin(length(x + 0.16, y - 0.4) - 0.46, length(x + 0.22, y + 0.12) - 0.42, 0.24);
      const flick = Math.sin(t * 2.2) * 0.03;
      const tail = sdTiltEllipse(x, y, 0.5, -0.04, 0.3, 0.66, 0.25 + flick);
      const ear = sdCone(x, y, -0.36, -0.36, 0.09, -0.42, -0.62, 0.03);
      return smin(smin(body, tail, 0.1), ear, 0.05);
    }
    case "golem": {
      const torso = sdRoundBox(x, y - 0.14, 0.56, 0.5, 0.16);
      const ax = Math.abs(x);
      const shoulders = length(ax - 0.6, y + 0.22) - 0.26;
      const arms = sdRoundBox(ax - 0.76, y - 0.32, 0.14, 0.28, 0.1);
      const legs = sdRoundBox(ax - 0.28, y - 0.72, 0.18, 0.14, 0.06);
      const head = sdRoundBox(x, y + 0.5, 0.24, 0.18, 0.08);
      return Math.min(smin(torso, Math.min(shoulders, head), 0.06), arms, legs);
    }
    case "cherry": {
      const front = length(x + 0.18, y - 0.36) - 0.5;
      const back = length(x - 0.44, y - 0.46) - 0.38;
      const stems = Math.min(sdCapsule(x, y, -0.16, -0.12, 0.16, -0.7, 0.06), sdCapsule(x, y, 0.42, 0.06, 0.16, -0.7, 0.06));
      const leaf = sdTiltEllipse(x, y, 0.4, -0.72, 0.2, 0.09, -0.4);
      return Math.min(smin(front, back, 0.04), stems, leaf);
    }
    case "banana": {
      // Two circles a little apart: thick in the middle for the face, thin at the tips.
      const bend = Math.max(length(x, y + 0.24) - 1.08, -(length(x, y + 0.96) - 1.2));
      const ends = Math.abs(x) - 0.82;
      const stem = sdCapsule(x, y, 0.74, -0.04, 0.84, -0.3, 0.065);
      return Math.min(smax(bend, ends, 0.16), stem);
    }
    case "carrot": {
      const root = sdCone(x, y, 0, -0.1, 0.6, 0, 0.78, 0.07);
      const sway = Math.sin(t * 1.5) * 0.03;
      const tops = Math.min(
        sdCapsule(x, y, 0, -0.56, -0.3 + sway, -0.84, 0.08),
        sdCapsule(x, y, 0, -0.56, sway, -0.9, 0.08),
        sdCapsule(x, y, 0, -0.56, 0.3 + sway, -0.84, 0.08),
      );
      return smin(root, tops, 0.06);
    }
    case "eggplant": {
      const body = sdCone(x, y, 0.06, 0.32, 0.54, -0.18, -0.24, 0.36);
      const cap = sdTiltEllipse(x, y, -0.22, -0.52, 0.36, 0.13, -0.4);
      const stem = sdCapsule(x, y, -0.24, -0.56, -0.14, -0.88, 0.06);
      return Math.min(smin(body, cap, 0.04), stem);
    }
    case "corn": {
      const cob = sdEllipse(x, y + 0.06, 0.5, 0.82);
      const husk = sdTiltEllipse(Math.abs(x), y, 0.42, 0.42, 0.2, 0.44, -0.5);
      return smin(cob, husk, 0.06);
    }
    case "cookie": {
      const disc = length(x, y - 0.04) - 0.82;
      const bite = Math.min(length(x - 0.7, y + 0.6) - 0.34, length(x - 0.92, y + 0.14) - 0.28);
      return smax(disc, -bite, 0.06);
    }
    case "macaron": {
      const top = sdEllipse(x, y - 0.06, 0.84, 0.38);
      const bottom = sdEllipse(x, y - 0.6, 0.84, 0.26);
      const filling = sdRoundBox(x, y - 0.36, 0.72, 0.12, 0.08);
      return Math.min(top, bottom, filling);
    }
    case "popsicle": {
      const ice = smax(sdRoundBox(x, y + 0.2, 0.62, 0.62, 0.36), -(length(x - 0.6, y + 0.82) - 0.3), 0.06);
      const stick = sdRoundBox(x, y - 0.6, 0.11, 0.24, 0.08);
      return Math.min(ice, stick);
    }
    case "cake": {
      const slice = sdPoly(x, y, CAKE) - 0.06;
      const cherry = length(x - 0.6, y + 0.42) - 0.16;
      const stalk = sdCapsule(x, y, 0.6, -0.56, 0.7, -0.8, 0.03);
      return Math.min(smin(slice, cherry, 0.04), stalk);
    }
    case "croissant": {
      let d = length(x, y - 0.28) - 0.5;
      for (const [cx, cy, r] of [[0.44, 0.4, 0.36], [0.7, 0.64, 0.22], [-0.44, 0.4, 0.36], [-0.7, 0.64, 0.22]] as const) {
        d = smin(d, length(x - cx, y - cy) - r, 0.04);
      }
      return d;
    }
    case "boba": {
      const cup = sdPoly(x, y, BOBA_CUP) - 0.06;
      const lid = Math.max(length(x, y + 0.14) - 0.54, y + 0.14);
      const rim = sdRoundBox(x, y + 0.14, 0.64, 0.06, 0.05);
      const straw = sdCapsule(x, y, 0.12, -0.5, 0.3, -0.86, 0.06);
      return Math.min(cup, lid, rim, straw);
    }
    case "pizza": {
      const slice = sdPoly(x, y, PIZZA) - 0.06;
      const crust = sdCapsule(x, y, -0.76, -0.5, 0.76, -0.5, 0.15);
      return smin(slice, crust, 0.04);
    }
    case "chili": {
      const body = smin(sdCone(x, y, -0.22, -0.04, 0.52, 0.28, 0.5, 0.3), sdCone(x, y, 0.28, 0.5, 0.3, 0.8, 0.78, 0.05), 0.08);
      const cap = sdTiltEllipse(x, y, -0.46, -0.48, 0.3, 0.13, 0.7);
      const stem = sdCapsule(x, y, -0.52, -0.54, -0.62, -0.88, 0.055);
      return Math.min(smin(body, cap, 0.04), stem);
    }
    case "grapes": {
      let d = Infinity;
      for (const [cx, cy, r] of [[-0.5, -0.24, 0.3], [0, -0.3, 0.32], [0.5, -0.24, 0.3], [-0.26, 0.2, 0.3], [0.26, 0.2, 0.3], [0, 0.6, 0.26]] as const) {
        d = smin(d, length(x - cx, y - cy) - r, 0.14);
      }
      d = Math.min(d, sdEllipse(x, y + 0.02, 0.62, 0.42));
      return Math.min(d, sdCapsule(x, y, 0, -0.56, 0.08, -0.86, 0.045), sdTiltEllipse(x, y, 0.3, -0.72, 0.2, 0.09, -0.3));
    }
    case "radish": {
      const bulb = length(x, y - 0.18) - 0.58;
      const root = sdCone(x, y, 0, 0.66, 0.1, 0.08, 0.86, 0.02);
      const sway = Math.sin(t * 1.4) * 0.03;
      const leaves = Math.min(sdTiltEllipse(x, y, -0.22 + sway, -0.64, 0.15, 0.3, -0.4), sdTiltEllipse(x, y, 0.22 + sway, -0.66, 0.15, 0.3, 0.4));
      return smin(smin(bulb, root, 0.08), leaves, 0.06);
    }
    case "popcorn": {
      const bucket = sdPoly(x, y, POPCORN) - 0.05;
      let pops = Infinity;
      for (const [cx, cy, r] of [[-0.44, -0.18, 0.22], [-0.16, -0.36, 0.26], [0.18, -0.34, 0.25], [0.46, -0.16, 0.22], [0.02, -0.6, 0.2]] as const) {
        pops = Math.min(pops, length(x - cx, y - cy) - r);
      }
      return smin(bucket, pops, 0.04);
    }
    case "fries": {
      const box = sdPoly(x, y, FRIES_BOX) - 0.06;
      let fries = Infinity;
      for (const [fx, top] of [[-0.38, -0.5], [-0.18, -0.76], [0.02, -0.62], [0.22, -0.84], [0.4, -0.54]] as const) {
        fries = Math.min(fries, sdCapsule(x, y, fx, 0, fx + fx * 0.12, top, 0.075));
      }
      return Math.min(box, fries);
    }
    case "hotdog": {
      const bun = sdRoundBox(x, y - 0.3, 0.76, 0.52, 0.46);
      const sausage = sdCapsule(x, y, -0.8, 0.2, 0.8, 0.2, 0.16);
      return Math.min(bun, sausage);
    }
    case "candy": {
      const sweet = length(x, y - 0.3) - 0.54;
      const twist = Math.sin(t * 1.8) * 0.03;
      const wraps = sdPoly(Math.abs(x), y - twist * Math.sign(x), CANDY_WRAP) - 0.04;
      return smin(sweet, wraps, 0.04);
    }
    case "teapot": {
      const body = sdEllipse(x, y - 0.32, 0.66, 0.52);
      const lid = Math.min(sdEllipse(x, y + 0.2, 0.38, 0.13), length(x, y + 0.38) - 0.1);
      const spout = sdCone(x, y, -0.5, 0.38, 0.15, -0.92, -0.04, 0.06);
      const handle = Math.max(sdRing(x, y, 0.62, 0.28, 0.22, 0.06), 0.52 - x);
      return Math.min(smin(body, Math.min(lid, spout), 0.06), handle);
    }
    case "cauldron": {
      const pot = Math.max(length(x, y - 0.2) - 0.66, -0.36 - y);
      const rim = sdRoundBox(x, y + 0.32, 0.64, 0.08, 0.07);
      const legs = sdCapsule(Math.abs(x), y, 0.32, 0.7, 0.42, 0.82, 0.05);
      const pop = Math.sin(t * 2.6) * 0.03;
      const bubbles = Math.min(length(x + 0.2, y + 0.56 + pop) - 0.15, length(x - 0.18, y + 0.66 - pop) - 0.13);
      return Math.min(smin(pot, rim, 0.04), legs, bubbles);
    }
    case "bottle": {
      const body = smin(sdRoundBox(x, y - 0.34, 0.54, 0.5, 0.22), sdRoundBox(x, y + 0.42, 0.16, 0.3, 0.06), 0.2);
      const cap = sdRoundBox(x, y + 0.76, 0.2, 0.1, 0.04);
      return Math.min(body, cap);
    }
    case "jar": {
      const body = sdRoundBox(x, y - 0.2, 0.7, 0.64, 0.3);
      const lid = sdRoundBox(x, y + 0.58, 0.58, 0.14, 0.06);
      return smin(body, lid, 0.04);
    }
    case "hourglass": {
      const bulbs = smin(sdEllipse(x, y + 0.34, 0.5, 0.42), sdEllipse(x, y - 0.38, 0.5, 0.42), 0.12);
      const frames = Math.min(sdRoundBox(x, y + 0.8, 0.66, 0.07, 0.05), sdRoundBox(x, y - 0.8, 0.66, 0.07, 0.05));
      const posts = sdCapsule(Math.abs(x), y, 0.58, -0.76, 0.58, 0.76, 0.04);
      return Math.min(bulbs, frames, posts);
    }
    case "lantern": {
      const body = sdRoundBox(x, y - 0.22, 0.56, 0.46, 0.2);
      const cap = sdPoly(x, y, LANTERN_CAP) - 0.04;
      const base = sdRoundBox(x, y - 0.74, 0.5, 0.1, 0.04);
      const handle = Math.max(sdRing(x, y, 0, -0.5, 0.22, 0.065), y + 0.5);
      return Math.min(smin(body, cap, 0.04), base, handle);
    }
    case "umbrella": {
      const scallop = 0.12 - 0.08 * Math.abs(Math.cos(x * Math.PI * 1.25));
      const canopy = Math.max(length(x, y - 0.12) - 0.92, y - scallop);
      const shaft = sdCapsule(x, y, 0, 0.1, 0, 0.66, 0.07);
      const hook = Math.max(sdRing(x, y, 0.17, 0.64, 0.17, 0.07), 0.64 - y);
      return Math.min(canopy, shaft, hook);
    }
    case "plant": {
      const pot = smin(sdPoly(x, y, PLANT_POT) - 0.04, sdRoundBox(x, y - 0.02, 0.66, 0.1, 0.05), 0.04);
      const sway = Math.sin(t * 1.3) * 0.03;
      const leaves = Math.min(
        sdTiltEllipse(x, y, -0.36 + sway, -0.4, 0.17, 0.36, -0.6),
        sdTiltEllipse(x, y, sway, -0.54, 0.17, 0.4, 0),
        sdTiltEllipse(x, y, 0.36 + sway, -0.4, 0.17, 0.36, 0.6),
      );
      return Math.min(pot, leaves);
    }
    case "globe": {
      const sphere = length(x, y + 0.02) - 0.64;
      const base = sdPoly(x, y, GLOBE_BASE) - 0.03;
      return Math.min(sphere, base);
    }
    case "mailbox": {
      const box = sdRoundBox(x, y + 0.1, 0.72, 0.44, 0.36);
      const post = sdRoundBox(x, y - 0.56, 0.13, 0.3, 0.03);
      const flag = Math.min(sdCapsule(x, y, 0.7, -0.1, 0.7, -0.6, 0.06), sdRoundBox(x - 0.8, y + 0.52, 0.13, 0.09, 0.03));
      return Math.min(box, post, flag);
    }
    case "cone": {
      const cone = Math.max(sdCone(x, y, 0, 0.4, 0.6, 0, -0.7, 0.12), y - 0.72);
      const base = sdRoundBox(x, y - 0.76, 0.86, 0.1, 0.05);
      return Math.min(cone, base);
    }
    case "hydrant": {
      const body = sdRoundBox(x, y - 0.24, 0.48, 0.48, 0.08);
      const cap = Math.max(length(x, y + 0.24) - 0.48, y + 0.24);
      const nub = sdRoundBox(x, y + 0.76, 0.12, 0.08, 0.04);
      const nozzles = sdRoundBox(Math.abs(x) - 0.56, y - 0.08, 0.12, 0.12, 0.04);
      const base = sdRoundBox(x, y - 0.76, 0.6, 0.09, 0.04);
      return Math.min(smin(body, cap, 0.04), nub, nozzles, base);
    }
    case "rain": {
      const cloud = smin(smin(length(x + 0.42, y + 0.04) - 0.36, length(x - 0.42, y + 0.04) - 0.36, 0.1), smin(length(x, y + 0.24) - 0.46, sdRoundBox(x, y - 0.1, 0.8, 0.24, 0.24), 0.12), 0.1);
      let drops = Infinity;
      for (const dx of [-0.42, 0, 0.42]) drops = Math.min(drops, sdCone(x, y, dx, 0.74, 0.11, dx, 0.5, 0.03));
      return Math.min(cloud, drops);
    }
    case "sun": {
      const core = length(x, y - 0.02) - 0.56;
      const step = Math.PI / 4;
      const angle = Math.atan2(x, -(y - 0.02)) + t * 0.2;
      const a = Math.round(angle / step) * step - t * 0.2;
      const ux = Math.sin(a), uy = -Math.cos(a);
      const ray = sdCone(x, y, ux * 0.7, 0.02 + uy * 0.7, 0.1, ux * 0.84, 0.02 + uy * 0.84, 0.03);
      return Math.min(core, ray);
    }
    case "crystal": {
      // Three prisms that overlap, so the face sits on one solid piece.
      const ax = Math.abs(x);
      return Math.min(sdPoly(x, y, CRYSTAL_MID) - 0.04, sdPoly(ax, y, CRYSTAL_SIDE) - 0.04);
    }
    case "tree": {
      const crown = smin(smin(length(x, y + 0.34) - 0.5, length(Math.abs(x) - 0.38, y + 0.02) - 0.42, 0.12), length(x, y - 0.06) - 0.46, 0.12);
      const trunk = sdRoundBox(x, y - 0.62, 0.14, 0.24, 0.04);
      return smin(crown, trunk, 0.06);
    }
    case "pine": {
      const tiers = Math.min(sdPoly(x, y, PINE_TOP), sdPoly(x, y, PINE_MID), sdPoly(x, y, PINE_LOW)) - 0.05;
      const trunk = sdRoundBox(x, y - 0.74, 0.14, 0.12, 0.03);
      return Math.min(tiers, trunk);
    }
    case "volcano": {
      const hill = smax(sdPoly(x, y, VOLCANO) - 0.04, -(length(x, y + 0.42) - 0.18), 0.06);
      const puff = Math.sin(t * 1.4) * 0.03;
      const smoke = Math.min(length(x - 0.1, y + 0.62 + puff) - 0.15, length(x + 0.1, y + 0.82 + puff * 1.5) - 0.13);
      return Math.min(hill, smoke);
    }
    case "comet": {
      const head = length(x + 0.16, y - 0.3) - 0.56;
      const tail = Math.min(
        sdCone(x, y, 0.0, 0.1, 0.42, 0.8, -0.72, 0.05),
        sdCone(x, y, 0.24, 0.34, 0.12, 0.94, -0.16, 0.03),
        sdCone(x, y, -0.18, -0.12, 0.12, 0.3, -0.92, 0.03),
      );
      return smin(head, tail, 0.06);
    }
    case "knight": {
      const helm = sdRoundBox(x, y - 0.06, 0.62, 0.64, 0.5);
      const gorget = sdPoly(x, y, GORGET) - 0.04;
      const sway = Math.sin(t * 1.6) * 0.04;
      const plume = sdTiltEllipse(x, y, 0.22 + sway, -0.68, 0.34, 0.13, -0.45);
      return smin(smin(helm, gorget, 0.06), plume, 0.06);
    }
    case "ninja": {
      const head = length(x, y - 0.14) - 0.7;
      const flow = Math.sin(t * 3) * 0.04;
      const tails = Math.min(sdCone(x, y, 0.6, -0.08, 0.11, 0.94, -0.42 + flow, 0.05), sdCone(x, y, 0.6, -0.04, 0.11, 0.94, 0.2 - flow, 0.05));
      const knot = length(x - 0.64, y + 0.06) - 0.1;
      return smin(head, Math.min(tails, knot), 0.04);
    }
    case "tower": {
      const body = sdRoundBox(x, y - 0.24, 0.56, 0.6, 0.04);
      const band = sdRoundBox(x, y + 0.4, 0.68, 0.1, 0.03);
      const merlons = sdRoundBox(Math.abs(x) < 0.25 ? x : Math.abs(x) - 0.52, y + 0.6, 0.14, 0.14, 0.03);
      return Math.min(smin(body, band, 0.04), merlons);
    }
    case "lighthouse": {
      const tower = sdPoly(x, y, LIGHTHOUSE) - 0.04;
      const gallery = sdRoundBox(x, y + 0.24, 0.46, 0.06, 0.03);
      const lamp = sdRoundBox(x, y + 0.44, 0.26, 0.16, 0.04);
      const dome = Math.max(length(x, y + 0.6) - 0.24, y + 0.6);
      return Math.min(tower, gallery, lamp, dome);
    }
    case "windmill": {
      const body = sdPoly(x, y, WINDMILL) - 0.04;
      const cap = Math.max(length(x, y + 0.04) - 0.36, y + 0.04);
      const a = t * 0.5 + 0.4;
      const c = Math.cos(a) * 0.72, s = Math.sin(a) * 0.72;
      const blades = Math.min(sdCapsule(x, y, -c, -0.22 - s, c, -0.22 + s, 0.09), sdCapsule(x, y, s, -0.22 - c, -s, -0.22 + c, 0.09));
      return Math.min(smin(body, cap, 0.04), blades);
    }
    case "camera": {
      const body = sdRoundBox(x, y - 0.32, 0.9, 0.52, 0.18);
      const hump = sdRoundBox(x + 0.26, y + 0.24, 0.32, 0.14, 0.08);
      const button = sdRoundBox(x - 0.54, y + 0.24, 0.14, 0.07, 0.04);
      return Math.min(smin(body, hump, 0.04), button);
    }
    case "joystick": {
      const base = sdRoundBox(x, y - 0.48, 0.84, 0.38, 0.26);
      const tilt = Math.sin(t * 1.4) * 0.06;
      const stick = sdCapsule(x, y, 0, 0.12, 0.06 + tilt, -0.4, 0.07);
      const ball = length(x - 0.08 - tilt, y + 0.58) - 0.26;
      return Math.min(base, stick, ball);
    }
    case "arcade": {
      const marquee = sdRoundBox(x, y + 0.66, 0.62, 0.16, 0.06);
      const screen = sdRoundBox(x, y + 0.06, 0.54, 0.46, 0.06);
      const panel = sdRoundBox(x, y - 0.4, 0.7, 0.08, 0.04);
      const cabinet = sdRoundBox(x, y - 0.66, 0.54, 0.2, 0.04);
      const stick = Math.min(sdCapsule(x, y, -0.28, -0.46, -0.28, -0.6, 0.03), length(x + 0.28, y + 0.62) - 0.07);
      return Math.min(marquee, screen, panel, cabinet, stick);
    }
    case "medal": {
      const ribbon = sdCone(Math.abs(x), y, 0.1, -0.2, 0.15, 0.34, -0.76, 0.15);
      const disc = length(x, y - 0.3) - 0.56;
      return smin(disc, ribbon, 0.04);
    }
    case "satellite": {
      const body = sdRoundBox(x, y - 0.32, 0.46, 0.52, 0.12);
      const panels = sdRoundBox(Math.abs(x) - 0.72, y - 0.22, 0.24, 0.34, 0.04);
      const dish = Math.min(Math.max(length(x, y + 0.42) - 0.34, -0.3 - y), sdCapsule(x, y, 0, -0.3, 0, -0.18, 0.06));
      const blink = sdCapsule(x, y, 0, -0.5, 0, -0.84, 0.05);
      return Math.min(body, panels, dish, blink);
    }
    case "tornado": {
      let d = Infinity;
      for (const [cy, rx, ry, k] of [[-0.56, 0.86, 0.26, 0], [-0.18, 0.72, 0.24, 1], [0.16, 0.52, 0.2, 2], [0.46, 0.36, 0.17, 3], [0.71, 0.2, 0.15, 4]] as const) {
        d = smin(d, sdEllipse(x - Math.sin(t * 2 + k) * 0.05 * k * 0.5, y - cy, rx, ry), 0.18);
      }
      return d;
    }
    case "stump": {
      const trunk = sdRoundBox(x, y - 0.26, 0.58, 0.52, 0.1);
      const top = sdEllipse(x, y + 0.24, 0.58, 0.14);
      const roots = sdCone(Math.abs(x), y, 0.38, 0.56, 0.18, 0.84, 0.8, 0.05);
      const sprout = Math.min(sdCapsule(x, y, 0.2, -0.3, 0.28, -0.62, 0.04), sdTiltEllipse(x, y, 0.42, -0.66, 0.14, 0.07, -0.4));
      return Math.min(smin(smin(trunk, top, 0.04), roots, 0.1), sprout);
    }
    case "lamp": {
      const shade = sdPoly(x, y, LAMP_SHADE) - 0.04;
      const stem = sdCapsule(x, y, 0, 0, 0, 0.66, 0.08);
      const base = sdEllipse(x, y - 0.74, 0.5, 0.12);
      return Math.min(shade, stem, base);
    }
    case "alarm": {
      const face = length(x, y - 0.12) - 0.64;
      const ax = Math.abs(x);
      const ring = Math.sin(t * 14) * 0.02 * Math.max(0, Math.sin(t * 0.9));
      const bells = sdTiltEllipse(ax, y, 0.5, -0.56 + ring, 0.24, 0.15, -0.7);
      const legs = sdCapsule(ax, y, 0.36, 0.62, 0.5, 0.82, 0.06);
      const knob = sdRoundBox(x, y + 0.56, 0.08, 0.06, 0.03);
      return Math.min(smin(face, knob, 0.04), bells, legs);
    }
    case "hotair": {
      const envelope = sdCone(x, y, 0, -0.24, 0.68, 0, 0.36, 0.16);
      const ropes = sdCapsule(Math.abs(x), y, 0.2, 0.48, 0.17, 0.66, 0.05);
      const basket = sdRoundBox(x, y - 0.76, 0.22, 0.1, 0.04);
      return Math.min(envelope, ropes, basket);
    }
    case "car": {
      const body = sdRoundBox(x, y - 0.4, 0.92, 0.28, 0.22);
      const cabin = sdRoundBox(x + 0.06, y - 0.02, 0.58, 0.32, 0.26);
      const wheels = length(Math.abs(x) - 0.52, y - 0.64) - 0.21;
      return Math.min(smin(body, cabin, 0.08), wheels);
    }
    case "boat": {
      const hull = sdPoly(x, y, HULL) - 0.04;
      const cabin = sdRoundBox(x + 0.1, y - 0.04, 0.5, 0.34, 0.1);
      const funnel = sdRoundBox(x - 0.32, y + 0.42, 0.12, 0.2, 0.04);
      const puff = length(x - 0.38, y + 0.76 + Math.sin(t * 1.5) * 0.02) - 0.14;
      return Math.min(smin(hull, cabin, 0.04), funnel, puff);
    }
    case "sub": {
      const hull = sdCapsule(x, y, -0.5, 0.42, 0.48, 0.42, 0.42);
      const tower = sdRoundBox(x + 0.08, y + 0.06, 0.26, 0.2, 0.1);
      const scope = Math.min(sdCapsule(x, y, 0.06, -0.24, 0.06, -0.6, 0.055), sdCapsule(x, y, 0.06, -0.6, 0.24, -0.6, 0.055));
      const prop = sdEllipse(x - 0.92, y - 0.42, 0.07, 0.18);
      return Math.min(smin(hull, tower, 0.06), scope, prop);
    }
    case "bone": {
      const shaft = sdCapsule(x, y, -0.5, 0.36, 0.5, 0.36, 0.34);
      const knobs = length(Math.abs(x) - 0.66, Math.abs(y - 0.36) - 0.26) - 0.24;
      return smin(shaft, knobs, 0.08);
    }
    case "sock": {
      const leg = sdRoundBox(x - 0.2, y + 0.12, 0.5, 0.56, 0.14);
      const foot = sdCapsule(x, y, 0.2, 0.56, -0.58, 0.56, 0.28);
      const cuff = sdRoundBox(x - 0.2, y + 0.66, 0.56, 0.12, 0.06);
      return Math.min(smin(leg, foot, 0.2), cuff);
    }
    case "tshirt": {
      const body = smax(sdRoundBox(x, y - 0.14, 0.56, 0.7, 0.08), -(length(x, y + 0.66) - 0.22), 0.06);
      const sleeves = sdPoly(Math.abs(x), y, SLEEVE) - 0.04;
      return smin(body, sleeves, 0.04);
    }
    case "tophat": {
      const crown = sdRoundBox(x, y + 0.02, 0.58, 0.62, 0.1);
      const brim = sdEllipse(x, y - 0.66, 0.92, 0.16);
      return smin(crown, brim, 0.06);
    }
    case "key": {
      const bow = length(x, y + 0.24) - 0.58;
      const shaft = sdRoundBox(x, y - 0.5, 0.1, 0.34, 0.04);
      const teeth = Math.min(sdRoundBox(x - 0.18, y - 0.62, 0.12, 0.06, 0.02), sdRoundBox(x - 0.16, y - 0.8, 0.1, 0.06, 0.02));
      return Math.min(smin(bow, shaft, 0.06), teeth);
    }
    case "raccoon": {
      const head = sdEllipse(x, y - 0.24, 0.76, 0.6);
      const ax = Math.abs(x);
      const ears = sdCone(ax, y, 0.44, -0.22, 0.2, 0.58, -0.64, 0.06);
      const cheeks = sdPoly(ax, y, RACCOON_CHEEK) - 0.03;
      return smin(head, Math.min(ears, cheeks), 0.06);
    }
    case "tiger": {
      const head = length(x, y - 0.14) - 0.7;
      const ax = Math.abs(x);
      const ears = length(ax - 0.5, y + 0.46) - 0.18;
      const ruff = sdPoly(ax, y, TIGER_RUFF) - 0.03;
      return smin(head, Math.min(ears, ruff), 0.06);
    }
    case "koi": {
      const swish = Math.sin(t * 2.4) * 0.04;
      const body = sdCone(x, y, 0, -0.06, 0.6, swish * 0.5, 0.52, 0.2);
      const ax = Math.abs(x - swish);
      const tail = sdTiltEllipse(ax, y, 0.22, 0.7, 0.26, 0.12, -0.6);
      const fins = sdTiltEllipse(Math.abs(x), y, 0.54, 0.14, 0.22, 0.1, 0.6);
      return smin(body, Math.min(tail, fins), 0.06);
    }
    case "dalmatian": {
      const head = sdEllipse(x, y - 0.1, 0.62, 0.62);
      const ax = Math.abs(x);
      const ears = sdTiltEllipse(ax, y, 0.62, 0.18, 0.18, 0.4, -0.25);
      const muzzle = sdEllipse(x, y - 0.54, 0.4, 0.3);
      return smin(smin(head, muzzle, 0.1), ears, 0.06);
    }
    case "zebra": {
      const head = sdCone(x, y, 0, -0.06, 0.58, 0, 0.5, 0.36);
      const ears = sdCone(Math.abs(x), y, 0.32, -0.42, 0.13, 0.5, -0.82, 0.04);
      const mane = sdRoundBox(x, y + 0.7, 0.1, 0.16, 0.08);
      return smin(head, Math.min(ears, mane), 0.06);
    }
    case "sprout": {
      const head = length(x, y - 0.14) - 0.72;
      const sway = Math.sin(t * 1.5) * 0.04;
      const stem = sdCone(x, y, 0, -0.5, 0.05, 0.04 + sway * 0.5, -0.76, 0.04);
      const lx = x - (0.2 + sway);
      const ly = y + 0.8;
      const c = Math.cos(0.5), s = Math.sin(0.5);
      const leaf = sdEllipse(lx * c - ly * s, lx * s + ly * c, 0.22, 0.1);
      return Math.min(head, stem, leaf);
    }
  }
}

/** Where the face sits on each body, so eyes stay inside a ghost's head and a drop's belly. */
/** `w` spreads the eyes apart without growing them, for faces with eyes on stalks. */
export const FACE: Record<MascotShapeId, { x: number; y: number; s: number; w?: number }> = {
  circle: { x: 0, y: 0, s: 1 },
  square: { x: 0, y: 0, s: 1 },
  slab: { x: 0, y: 0.06, s: 0.96 },
  tall: { x: 0, y: -0.14, s: 0.9 },
  egg: { x: 0, y: 0.08, s: 0.94 },
  pebble: { x: 0, y: 0.2, s: 0.9 },
  bean: { x: -0.04, y: -0.04, s: 0.96 },
  drop: { x: 0, y: 0.22, s: 0.9 },
  ghost: { x: 0, y: -0.1, s: 0.96 },
  puff: { x: 0, y: 0.02, s: 0.94 },
  flower: { x: 0, y: 0.06, s: 0.86 },
  star: { x: 0, y: 0.1, s: 0.78 },
  heart: { x: 0, y: -0.06, s: 0.84 },
  diamond: { x: 0, y: 0.04, s: 0.8 },
  hexagon: { x: 0, y: 0.04, s: 0.94 },
  cat: { x: 0, y: 0.16, s: 0.94 },
  bear: { x: 0, y: 0.16, s: 0.94 },
  sprout: { x: 0, y: 0.18, s: 0.92 },
  bunny: { x: 0, y: 0.28, s: 0.86 },
  devil: { x: 0, y: 0.1, s: 0.94 },
  alien: { x: 0, y: 0.18, s: 0.94 },
  mushroom: { x: 0, y: 0.44, s: 0.7 },
  onigiri: { x: 0, y: 0.3, s: 0.78 },
  slime: { x: 0, y: 0.1, s: 0.94 },
  pear: { x: 0, y: 0.32, s: 0.8 },
  spiky: { x: 0, y: 0.02, s: 0.86 },
  pill: { x: 0, y: -0.1, s: 0.84 },
  dome: { x: 0, y: 0.16, s: 0.96 },
  blob: { x: 0, y: 0.04, s: 0.94 },
  moon: { x: -0.34, y: 0.16, s: 0.62 },
  octagon: { x: 0, y: 0.02, s: 0.98 },
  gem: { x: 0, y: -0.14, s: 0.86 },
  shield: { x: 0, y: -0.14, s: 0.92 },
  lemon: { x: 0, y: 0.16, s: 0.86 },
  apple: { x: 0, y: 0.2, s: 0.94 },
  pumpkin: { x: 0, y: 0.2, s: 0.9, w: 1.15 },
  acorn: { x: 0, y: 0.26, s: 0.78 },
  cactus: { x: 0, y: -0.2, s: 0.64 },
  flame: { x: 0, y: 0.34, s: 0.74 },
  snowman: { x: 0, y: -0.4, s: 0.7 },
  dumpling: { x: 0, y: 0.34, s: 0.86 },
  bell: { x: 0, y: 0.04, s: 0.84 },
  ufo: { x: 0, y: -0.18, s: 0.66 },
  robot: { x: 0, y: 0.1, s: 0.96, w: 1.15 },
  crown: { x: 0, y: 0.28, s: 0.86 },
  unicorn: { x: 0, y: 0.18, s: 0.94 },
  fox: { x: 0, y: 0.18, s: 0.88 },
  mouse: { x: 0, y: 0.28, s: 0.86 },
  frog: { x: 0, y: -0.14, s: 0.86, w: 2 },
  chick: { x: 0, y: 0.12, s: 0.94 },
  octopus: { x: 0, y: -0.06, s: 0.92 },
  jellyfish: { x: 0, y: -0.1, s: 0.9 },
  pentagon: { x: 0, y: 0.08, s: 0.92 },
  plus: { x: 0, y: 0.06, s: 0.86 },
  peanut: { x: 0, y: 0.26, s: 0.78 },
  leaf: { x: 0, y: 0.08, s: 0.8 },
  shell: { x: 0, y: 0.02, s: 0.8 },
  tulip: { x: 0, y: 0.1, s: 0.82 },
  penguin: { x: 0, y: -0.16, s: 0.84 },
  owl: { x: 0, y: 0.1, s: 0.94 },
  pig: { x: 0, y: 0.08, s: 0.88 },
  koala: { x: 0, y: 0.28, s: 0.84 },
  hamster: { x: 0, y: 0.12, s: 0.82 },
  puppy: { x: 0, y: 0.18, s: 0.86 },
  bat: { x: 0, y: 0.28, s: 0.84 },
  hedgehog: { x: 0, y: 0.42, s: 0.84 },
  axolotl: { x: 0, y: 0.32, s: 0.82 },
  hatch: { x: 0, y: -0.08, s: 0.76 },
  bee: { x: 0, y: 0.32, s: 0.84 },
  snail: { x: 0.14, y: 0.2, s: 0.8 },
  turtle: { x: 0, y: 0.2, s: 0.74 },
  crab: { x: 0, y: 0.4, s: 0.74 },
  fish: { x: -0.22, y: 0.34, s: 0.76 },
  whale: { x: -0.2, y: 0.38, s: 0.78 },
  shark: { x: -0.14, y: 0.36, s: 0.78 },
  strawberry: { x: 0, y: 0.04, s: 0.86 },
  pineapple: { x: 0, y: 0.32, s: 0.82 },
  cupcake: { x: 0, y: 0.14, s: 0.82 },
  icecream: { x: 0, y: -0.14, s: 0.84 },
  pudding: { x: 0, y: 0.16, s: 0.86 },
  toast: { x: 0, y: 0.16, s: 0.9 },
  burger: { x: 0, y: -0.18, s: 0.78 },
  bowl: { x: 0, y: 0.4, s: 0.8 },
  mitten: { x: 0.1, y: -0.02, s: 0.84 },
  tooth: { x: 0, y: -0.1, s: 0.86 },
  candle: { x: 0, y: 0.18, s: 0.76 },
  bulb: { x: 0, y: -0.14, s: 0.86 },
  mug: { x: -0.14, y: 0.18, s: 0.9 },
  potion: { x: 0, y: 0.3, s: 0.84 },
  balloon: { x: 0, y: -0.12, s: 0.9 },
  present: { x: 0, y: 0.44, s: 0.84 },
  padlock: { x: 0, y: 0.42, s: 0.86 },
  house: { x: 0, y: 0.44, s: 0.82 },
  tv: { x: 0, y: 0.16, s: 0.92 },
  gamepad: { x: 0, y: 0.32, s: 0.78 },
  trophy: { x: 0, y: -0.26, s: 0.76 },
  chest: { x: 0, y: 0.54, s: 0.8 },
  bomb: { x: 0, y: 0.18, s: 0.9 },
  pawn: { x: 0, y: -0.34, s: 0.64 },
  spade: { x: 0, y: 0.04, s: 0.8 },
  club: { x: 0, y: 0.04, s: 0.76 },
  wizard: { x: 0, y: 0.3, s: 0.82 },
  rocket: { x: 0, y: -0.02, s: 0.74 },
  planet: { x: 0, y: 0.2, s: 0.82 },
  panda: { x: 0, y: 0.16, s: 0.92 },
  ladybug: { x: 0, y: 0.14, s: 0.88 },
  elephant: { x: 0, y: 0.06, s: 0.84 },
  lion: { x: 0, y: 0.06, s: 0.88 },
  sheep: { x: 0.08, y: 0.14, s: 0.78 },
  cow: { x: 0, y: 0.1, s: 0.84 },
  duck: { x: -0.2, y: 0.02, s: 0.76 },
  seal: { x: 0.1, y: 0.36, s: 0.72 },
  dragon: { x: 0, y: 0.16, s: 0.9 },
  dino: { x: 0.16, y: 0.36, s: 0.74 },
  deer: { x: 0, y: 0.1, s: 0.8 },
  giraffe: { x: 0, y: 0.06, s: 0.8 },
  monkey: { x: 0, y: 0.22, s: 0.86 },
  mole: { x: 0, y: 0.12, s: 0.84 },
  squid: { x: 0, y: 0.16, s: 0.76 },
  ray: { x: 0, y: 0.08, s: 0.8 },
  butterfly: { x: 0, y: -0.08, s: 0.76 },
  spider: { x: 0, y: 0.2, s: 0.84 },
  caterpillar: { x: -0.4, y: 0.1, s: 0.7 },
  yeti: { x: 0, y: 0.1, s: 0.9 },
  goose: { x: 0.12, y: 0.44, s: 0.72 },
  toucan: { x: 0.2, y: 0.2, s: 0.84 },
  parrot: { x: 0.04, y: 0.14, s: 0.82 },
  rhino: { x: 0, y: 0.32, s: 0.76 },
  hippo: { x: 0, y: 0, s: 0.8 },
  llama: { x: 0, y: -0.1, s: 0.8 },
  camel: { x: 0.02, y: 0.36, s: 0.66 },
  ram: { x: 0, y: 0.24, s: 0.82 },
  walrus: { x: 0, y: 0.02, s: 0.88 },
  hen: { x: 0, y: 0.14, s: 0.86 },
  squirrel: { x: -0.14, y: 0.3, s: 0.72 },
  golem: { x: 0, y: 0.16, s: 0.86 },
  cherry: { x: -0.16, y: 0.38, s: 0.72 },
  banana: { x: 0, y: 0.6, s: 0.74 },
  carrot: { x: 0, y: 0, s: 0.8 },
  eggplant: { x: 0.04, y: 0.3, s: 0.84 },
  corn: { x: 0, y: 0, s: 0.76 },
  cookie: { x: -0.04, y: 0.08, s: 0.92 },
  macaron: { x: 0, y: 0.26, s: 0.88 },
  popsicle: { x: 0, y: -0.12, s: 0.86 },
  cake: { x: -0.04, y: 0.46, s: 0.76 },
  croissant: { x: 0, y: 0.36, s: 0.74 },
  boba: { x: 0, y: 0.32, s: 0.82 },
  pizza: { x: 0, y: -0.12, s: 0.74 },
  chili: { x: -0.16, y: 0.1, s: 0.78 },
  grapes: { x: 0, y: 0.02, s: 0.8 },
  radish: { x: 0, y: 0.2, s: 0.86 },
  popcorn: { x: 0, y: 0.36, s: 0.8 },
  fries: { x: 0, y: 0.38, s: 0.82 },
  hotdog: { x: 0, y: 0.3, s: 0.86 },
  candy: { x: 0, y: 0.32, s: 0.8 },
  teapot: { x: 0, y: 0.34, s: 0.88 },
  cauldron: { x: 0, y: 0.24, s: 0.9 },
  bottle: { x: 0, y: 0.32, s: 0.82 },
  jar: { x: 0, y: 0.22, s: 0.94 },
  hourglass: { x: 0, y: -0.3, s: 0.72 },
  lantern: { x: 0, y: 0.24, s: 0.84 },
  umbrella: { x: 0, y: -0.2, s: 0.84 },
  plant: { x: 0, y: 0.38, s: 0.8 },
  globe: { x: 0, y: 0, s: 0.88 },
  mailbox: { x: 0, y: -0.1, s: 0.86 },
  cone: { x: 0, y: 0.3, s: 0.74 },
  hydrant: { x: 0, y: 0.18, s: 0.8 },
  rain: { x: 0, y: -0.02, s: 0.84 },
  sun: { x: 0, y: 0.06, s: 0.86 },
  crystal: { x: 0, y: 0.4, s: 0.76 },
  tree: { x: 0, y: -0.08, s: 0.86 },
  pine: { x: 0, y: 0.38, s: 0.7 },
  volcano: { x: 0, y: 0.38, s: 0.82 },
  comet: { x: -0.16, y: 0.32, s: 0.8 },
  knight: { x: 0, y: 0.08, s: 0.9 },
  ninja: { x: 0, y: 0.16, s: 0.92 },
  tower: { x: 0, y: 0.24, s: 0.9 },
  lighthouse: { x: 0, y: 0.44, s: 0.74 },
  windmill: { x: 0, y: 0.46, s: 0.76 },
  camera: { x: 0, y: 0.34, s: 0.86 },
  joystick: { x: 0, y: 0.5, s: 0.74 },
  arcade: { x: 0, y: 0, s: 0.8 },
  medal: { x: 0, y: 0.32, s: 0.86 },
  satellite: { x: 0, y: 0.34, s: 0.76 },
  tornado: { x: 0, y: -0.28, s: 0.76 },
  stump: { x: 0, y: 0.3, s: 0.86 },
  lamp: { x: 0, y: -0.4, s: 0.74 },
  alarm: { x: 0, y: 0.14, s: 0.88 },
  hotair: { x: 0, y: -0.18, s: 0.9 },
  car: { x: 0.02, y: 0.16, s: 0.8 },
  boat: { x: -0.08, y: 0.18, s: 0.76 },
  sub: { x: -0.12, y: 0.42, s: 0.76 },
  bone: { x: 0, y: 0.36, s: 0.72 },
  sock: { x: 0.2, y: -0.08, s: 0.86 },
  tshirt: { x: 0, y: 0.18, s: 0.86 },
  tophat: { x: 0, y: 0.02, s: 0.88 },
  key: { x: 0, y: -0.22, s: 0.86 },
  raccoon: { x: 0, y: 0.24, s: 0.9 },
  tiger: { x: 0, y: 0.16, s: 0.92 },
  koi: { x: 0, y: 0.02, s: 0.86 },
  dalmatian: { x: 0, y: 0.1, s: 0.86 },
  zebra: { x: 0, y: 0.1, s: 0.86 },
  bust: { x: 0, y: -0.12, s: 0.98 },
  moptop: { x: 0, y: 0.27, s: 0.9 },
  spikecut: { x: 0, y: 0.16, s: 0.98 },
  sidepart: { x: 0, y: 0.2, s: 0.94 },
  shortfringe: { x: 0, y: 0.19, s: 0.9 },
  shortquiff: { x: 0, y: 0.14, s: 0.85 },
  tousled: { x: 0, y: 0.14, s: 0.85 },
  shavedbeard: { x: 0, y: 0.0, s: 0.88 },
  softbob: { x: 0, y: 0.06, s: 0.84 },
  roundbob: { x: 0, y: 0.06, s: 0.84 },
  shortcurls: { x: 0, y: 0.34, s: 0.74 },
  layeredfringe: { x: 0, y: 0.28, s: 0.80 },
  silkfringe: { x: -0.025, y: 0.29, s: 0.98, w: 1.03 },
  pompadour: { x: 0, y: 0.22, s: 0.94 },
  sculpt: { x: 0.08, y: -0.3, s: 0.7 },
  pyramid: { x: 0, y: 0.14, s: 1.04 },
  quiff: { x: 0, y: 0.12, s: 0.92 },
  fullbeard: { x: 0, y: 0.0, s: 0.9 },
  waves: { x: 0, y: 0.02, s: 0.86 },
  tache: { x: 0, y: 0.12, s: 0.9 },
  longhair: { x: 0, y: 0.06, s: 0.84 },
  longwaves: { x: 0, y: 0.06, s: 0.84 },
  deepwaves: { x: 0, y: 0.06, s: 0.82 },
  buzzcut: { x: 0, y: 0.2, s: 0.88 },
  crewcut: { x: 0, y: 0.2, s: 0.88 },
  texturedcrop: { x: 0, y: 0.2, s: 0.88 },
  taperedcrop: { x: 0, y: 0.2, s: 0.88 },
  softquiff: { x: 0, y: 0.2, s: 0.88 },
  curlycrop: { x: 0, y: 0.2, s: 0.88 },
  receding: { x: 0, y: 0.2, s: 0.88 },
  slickback: { x: 0, y: 0.2, s: 0.88 },
  fauxhawk: { x: 0, y: 0.2, s: 0.88 },
  pixie: { x: 0, y: 0.2, s: 0.88 },
  cornrows: { x: 0, y: 0.2, s: 0.88 },
  curtains: { x: 0, y: 0.2, s: 0.88 },
  afro: { x: 0, y: 0.24, s: 0.8 },
  topknot: { x: 0, y: 0.22, s: 0.86 },
  twinbuns: { x: 0, y: 0.22, s: 0.86 },
  bob: { x: 0, y: 0.22, s: 0.84 },
  lowpony: { x: 0, y: 0.2, s: 0.88 },
  locs: { x: 0, y: 0.2, s: 0.82 },
  sideswept: { x: 0, y: 0.2, s: 0.88 },
  skinfade: { x: 0, y: 0.2, s: 0.88 },
  undercut: { x: 0, y: 0.2, s: 0.88 },
  frenchcrop: { x: 0, y: 0.2, s: 0.88 },
  mohawk: { x: 0, y: 0.2, s: 0.88 },
  lob: { x: 0, y: 0.2, s: 0.88 },
  bluntbangs: { x: 0, y: 0.2, s: 0.88 },
  curtainbangs: { x: 0, y: 0.2, s: 0.88 },
  shag: { x: 0, y: 0.2, s: 0.88 },
  longcurls: { x: 0, y: 0.2, s: 0.88 },
  afropuff: { x: 0, y: 0.2, s: 0.88 },
  highpony: { x: 0, y: 0.2, s: 0.88 },
  highbun: { x: 0, y: 0.2, s: 0.88 },
  messybun: { x: 0, y: 0.2, s: 0.88 },
  pigtails: { x: 0, y: 0.2, s: 0.88 },
  boxbraids: { x: 0, y: 0.2, s: 0.88 },
  halfup: { x: 0, y: 0.2, s: 0.88 },
};

/** The head alone, honouring a morph: the outline before any facial hair fills it out. */
function headDistance(look: MascotLook, pose: MascotPose, x: number, y: number) {
  const to = sdShape(look.shape, x, y, pose.wobble);
  if (!pose.fromShape || pose.morph >= 1) return to;
  return lerp(sdShape(pose.fromShape, x, y, pose.wobble), to, pose.morph);
}

export function bodyDistance(look: MascotLook, pose: MascotPose, x: number, y: number) {
  const d = headDistance(look, pose, x, y);
  return look.facialHair ? joinFacialHair(look.facialHair, lowerFace(look, pose), x, y, d) : d;
}

export function faceAnchor(look: MascotLook, pose: MascotPose) {
  const to = FACE[look.shape];
  if (!pose.fromShape || pose.morph >= 1) return { ...to, w: to.w ?? 1 };
  const from = FACE[pose.fromShape];
  return {
    x: lerp(from.x, to.x, pose.morph),
    y: lerp(from.y, to.y, pose.morph),
    s: lerp(from.s, to.s, pose.morph),
    w: lerp(from.w ?? 1, to.w ?? 1, pose.morph),
  };
}

/* ------------------------------------------------------------------------- *
 * Markings: the second ink
 * ------------------------------------------------------------------------- */

/**
 * A shape's markings: a distance, under 0 inside a patch, drawn in the colour's second
 * ink (`markInks`) with the body's own lighting and dither, and under the eyes. Only the
 * shapes listed have any; every other shape is drawn exactly as it was.
 *
 * Eyes that land on a patch keep their own inks when those still read against it and
 * swap to the body's base tone when they do not, so a panda in White does not lose its
 * dark eyes inside its dark patches. That is decided in `inkColor`, not here.
 */
export const MARKINGS: Partial<Record<MascotShapeId, { sd: (x: number, y: number, t: number) => number; tone?: MascotMarkTone }>> = {
  shortquiff: {
    sd: (x, y) => shortQuiffHair(x, y),
    tone: "brown",
  },
  tousled: {
    sd: (x, y) => tousledHair(x, y),
    tone: "brown",
  },
  shavedbeard: {
    sd: (x, y) => shavedBeard(x, y),
    tone: "dark",
  },
  spikecut: {
    sd: (x, y) => cropHair(x, y),
    tone: "dark",
  },
  shortfringe: {
    sd: (x, y) => shortFringeHair(x, y),
    tone: "brown",
  },
  shortcurls: {
    sd: (x, y) => shortCurlsHair(x, y),
    tone: "dark",
  },
  texturedcrop: {
    sd: (x, y) => texturedCropHair(x, y),
    tone: "brown",
  },
  taperedcrop: {
    sd: (x, y) => taperedCropHair(x, y),
    tone: "brown",
  },
  softquiff: {
    sd: (x, y) => softQuiffHair(x, y),
    tone: "brown",
  },
  curlycrop: {
    sd: (x, y) => curlyCropHair(x, y),
    tone: "dark",
  },
  silkfringe: {
    sd: (x, y) => silkFringeLines(x, y),
    tone: "grey",
  },
  layeredfringe: {
    sd: (x, y) => layeredFringeHair(x, y),
    tone: "dark",
  },
  sidepart: {
    sd: (x, y) => sidepartHair(x, y),
    tone: "grey",
  },
  pompadour: {
    sd: (x, y) => pompadourHair(x, y),
    tone: "dark",
  },
  quiff: {
    sd: (x, y) => quiffHair(x, y),
    tone: "dark",
  },
  fullbeard: {
    sd: (x, y) => fullbeardHair(x, y),
    tone: "brown",
  },
  waves: {
    // Everything but the face is hair and beard, and the grin cuts through the beard to the skin.
    sd: (x, y) => Math.max(-wavesSkin(x, y), -wavesGrin(x, y)),
    tone: "dark",
  },
  tache: {
    sd: (x, y) => Math.min(tacheHair(x, y), tacheMoustache(x, y)),
    tone: "dark",
  },
  longhair: {
    // Everything but the face is hair.
    sd: (x, y) => -longhairSkin(x, y),
    tone: "dark",
  },
  longwaves: {
    sd: (x, y) => -longwavesSkin(x, y),
    tone: "dark",
  },
  deepwaves: {
    sd: (x, y) => -deepwavesSkin(x, y),
    tone: "dark",
  },
  ...haircutMarkings(),
  softbob: { sd: (x, y) => -softbobSkin(x, y), tone: "brown" },
  moptop: {
    // Everything that is not the face is hair: dark whatever the skin, as hair is.
    sd: (x, y) => -mopFace(x, y),
    tone: "dark",
  },
  pyramid: {
    // Courses of brick: a mortar line every 0.2 down the body and a joint every 0.34
    // across, each course offset half a brick from the one above, as in his picture.
    // None round the eye line (FACE puts it at y 0.015): eyes that land on a dark mark
    // swap to the body's ink, which cut two classic eyes into pieces wherever the mortar
    // crossed them. His one eye fills that space anyway.
    sd: (x, y) => {
      if (sdEllipse(x, y - 0.015, 0.5, 0.3) < 0) return Infinity;
      const course = Math.floor((y + 0.9) / 0.2);
      const bed = Math.abs((y + 0.9) - course * 0.2 - 0.1);
      const shift = course & 1 ? 0.17 : 0;
      const joint = Math.abs((((x + shift + 1.7) % 0.34) + 0.34) % 0.34 - 0.17);
      return Math.min(0.1 - bed, 0.17 - joint) - 0.022;
    },
    tone: "dark",
  },
  bust: {
    // Recessed locks and beard grooves keep the stone face one material.
    sd: (x, y) => {
      if (y < -0.57 + 0.045 * Math.cos(x * 12)) {
        return Math.abs(x + 0.045 * Math.sin(y * 14)) % 0.19 - 0.025;
      }
      if (y < 0.22 || y > 0.78) return Infinity;
      const wave = x + 0.035 * Math.sin(y * 22);
      const grooves = Math.abs((wave + 0.6) % 0.17 - 0.085) - 0.018;
      return Math.max(grooves, sdCone(x, y, 0, 0.28, 0.42, 0, 0.73, 0.08));
    },
    tone: "dark",
  },
  panda: {
    sd: (x, y) => {
      const ears = Math.min(length(x + 0.56, y + 0.46) - 0.27, length(x - 0.56, y + 0.46) - 0.27);
      const patches = Math.min(
        sdTiltEllipse(x, y, -0.22, 0.06, 0.15, 0.21, -0.55),
        sdTiltEllipse(x, y, 0.22, 0.04, 0.15, 0.21, 0.55),
      );
      return Math.min(ears, patches);
    },
  },
  ladybug: {
    sd: (x, y) => {
      const head = y + 0.36;
      const seam = y > -0.34 ? Math.abs(x) - 0.03 : Infinity;
      const spots = Math.min(
        length(Math.abs(x) - 0.56, y + 0.06) - 0.13,
        length(Math.abs(x) - 0.4, y - 0.5) - 0.14,
        length(Math.abs(x) - 0.7, y - 0.3) - 0.09,
      );
      return Math.min(head, seam, spots);
    },
  },
  cow: {
    sd: (x, y) => Math.min(sdTiltEllipse(x, y, 0.34, -0.14, 0.24, 0.3, 0.5), sdTiltEllipse(x, y, -0.42, 0.3, 0.16, 0.12, 0.3)),
  },
  giraffe: {
    sd: (x, y) => Math.min(length(x + 0.3, y + 0.04) - 0.1, length(x - 0.32, y) - 0.09, length(x, y + 0.3) - 0.08, length(x - 0.12, y - 0.66) - 0.08),
  },
  monkey: {
    // The bare face around the eyes and the muzzle, a material rather than a pattern.
    sd: (x, y) => smin(length(Math.abs(x) - 0.2, y - 0.1) - 0.27, sdEllipse(x, y - 0.48, 0.44, 0.3), 0.12),
    tone: "light",
  },
  ninja: {
    // The slit in the hood, which is what the eyes look out of.
    sd: (x, y) => sdRoundBox(x, y - 0.04, 0.54, 0.2, 0.18),
    tone: "light",
  },
  raccoon: {
    sd: (x, y) => smin(sdTiltEllipse(x, y, -0.25, 0.14, 0.27, 0.17, -0.25), sdTiltEllipse(x, y, 0.25, 0.12, 0.27, 0.17, 0.25), 0.1),
  },
  tiger: {
    sd: (x, y) => {
      const ax = Math.abs(x);
      return Math.min(
        sdCapsule(x, y, 0, -0.54, 0, -0.32, 0.045),
        sdCapsule(ax, y, 0.22, -0.5, 0.17, -0.34, 0.04),
        sdCapsule(ax, y, 0.72, 0.14, 0.5, 0.2, 0.04),
        sdCapsule(ax, y, 0.68, 0.36, 0.48, 0.36, 0.04),
      );
    },
  },
  koi: {
    sd: (x, y) => Math.min(sdEllipse(x + 0.12, y + 0.5, 0.24, 0.14), sdEllipse(x - 0.16, y - 0.38, 0.22, 0.14)),
  },
  dalmatian: {
    sd: (x, y) => Math.min(
      sdTiltEllipse(x, y, -0.62, 0.18, 0.2, 0.42, 0.25),
      length(x - 0.38, y - 0.3) - 0.09,
      length(x - 0.22, y + 0.38) - 0.08,
      length(x + 0.26, y - 0.5) - 0.07,
      length(x + 0.06, y + 0.4) - 0.06,
    ),
  },
  zebra: {
    sd: (x, y) => {
      // Chevrons on the brow and down the cheeks; the eyes and muzzle stay plain.
      if (y > -0.26 && Math.abs(x) < 0.46) return Infinity;
      const v = y - 0.5 * Math.abs(x) + 2;
      return (Math.abs(((v * 3.6) % 1) - 0.5) - 0.18) / 3.6;
    },
  },
};

/** The markings at a point, honouring a morph, with any facial hair; `Infinity` where there are none. */
export function markingDistance(look: MascotLook, pose: MascotPose, x: number, y: number) {
  const marks = shapeMarkingDistance(look, pose, x, y);
  return Math.min(marks, faceHairDistance(look, pose, x, y));
}

/**
 * The beard inside a judge's own head, as opposed to the hair on top of it, under 0 inside;
 * `Infinity` on a shape without one. A beard picked in the facial hair slot is apart
 * already (`faceHairDistance`). These shapes predate that slot and paint head hair and
 * beard as one marking, so the 3D head painted the beard on the back of the skull too
 * (4 Nov 2026: facial hair should not go to the back of the head). The back
 * reads this to leave the beard off. Sideburns that run down into a beard count as beard
 * below the ears, so the hair on the back stops at the nape.
 */
export const BEARDED_SHAPES: ReadonlySet<MascotShapeId> = new Set(["shavedbeard", "slickback", "quiff", "fullbeard", "waves", "tache", "bust"]);

export function shapeBeardDistance(shape: MascotShapeId, x: number, y: number): number {
  switch (shape) {
    case "shavedbeard":
    case "slickback":
      return shavedBeard(x, y);
    case "quiff":
      return Math.min(0.44 - 0.45 * x * x - y, Math.max(0.63 - Math.abs(x), y - 0.3, 0.04 - y));
    case "fullbeard":
      return Math.min(0.36 - 0.42 * x * x - y, Math.max(0.58 - Math.abs(x), y - 0.12, 0.04 - y));
    case "waves":
      return Math.max(sdEllipse(x, y + 0.06, 0.57, 0.64), (0.28 - 0.3 * x * x) - y);
    case "tache":
      return tacheMoustache(x, y);
    case "bust":
      return y < 0.22 || y > 0.78 ? Infinity : sdCone(x, y, 0, 0.28, 0.42, 0, 0.73, 0.08);
    default:
      return Infinity;
  }
}

/** Kept separate from the head's markings so beard colour never repaints the hair. */
export function faceHairDistance(look: MascotLook, pose: MascotPose, x: number, y: number) {
  return look.facialHair ? facialHairDistance(look.facialHair, lowerFace(look, pose), x, y, headDistance(look, pose, x, y)) : Infinity;
}

function shapeMarkingDistance(look: MascotLook, pose: MascotPose, x: number, y: number) {
  const to = MARKINGS[look.shape];
  const dTo = to ? to.sd(x, y, pose.wobble) : Infinity;
  if (!pose.fromShape || pose.morph >= 1) return dTo;
  const from = MARKINGS[pose.fromShape];
  if (!from && !to) return Infinity;
  /* A shape with no markings morphs as if its patch were a little way outside it, so a
     panda's patches shrink away rather than blinking off. */
  const dFrom = from ? from.sd(x, y, pose.wobble) : 0.3;
  return lerp(dFrom, to ? dTo : 0.3, pose.morph);
}

/** The tone mode of the markings being drawn, the target shape's once a morph is past half. */
export function markingTone(look: MascotLook, pose: MascotPose): MascotMarkTone {
  const shape = pose.fromShape && pose.morph < 0.5 ? pose.fromShape : look.shape;
  /* Facial hair is hair: on a head with no markings of its own it is dark, as the hair
     on the judges' heads is, whatever the skin. On a head with hair it takes that hair's. */
  return MARKINGS[shape]?.tone ?? MARKINGS[look.shape]?.tone ?? (look.facialHair ? "dark" : "contrast");
}

/* ------------------------------------------------------------------------- *
 * The lower face: where facial hair sits
 * ------------------------------------------------------------------------- */

const lowerCache = new Map<MascotShapeId, LowerFace>();

/**
 * The eye line, the chin and the jaw's width on the mouth line, read off the shape the way
 * `deriveHead` reads a hat's seat, so a new shape gets a beard that fits for free. The chin
 * is where the face's centre line leaves the body below the eyes.
 */
function deriveLowerFace(shape: MascotShapeId): LowerFace {
  const cached = lowerCache.get(shape);
  if (cached) return cached;
  const face = FACE[shape];
  const eye = face.y - 0.12 * face.s;
  let chin = Math.min(face.y + 0.5, 0.86);
  for (let y = face.y; y < 1.2; y += 0.01) {
    if (sdShape(shape, face.x, y, 0) >= 0) {
      chin = y;
      break;
    }
  }
  const jaw = Math.max(0.2, chord(shape, face.x, eye + 0.64 * (chin - eye)));
  const lower = { x: face.x, eye, chin, jaw };
  lowerCache.set(shape, lower);
  return lower;
}

/** The lower face for a look and pose, blended across a morph. */
export function lowerFace(look: MascotLook, pose: MascotPose): LowerFace {
  const to = deriveLowerFace(look.shape);
  if (!pose.fromShape || pose.morph >= 1) return to;
  const from = deriveLowerFace(pose.fromShape);
  const m = pose.morph;
  return { x: lerp(from.x, to.x, m), eye: lerp(from.eye, to.eye, m), chin: lerp(from.chin, to.chin, m), jaw: lerp(from.jaw, to.jaw, m) };
}

/* ------------------------------------------------------------------------- *
 * The head: where accessories sit
 * ------------------------------------------------------------------------- */

/**
 * Where an accessory goes on a body, in body units, y down. Accessories are drawn
 * relative to these and nothing else, which is what lets one crown sit on a circle, a
 * cat between its ears and a pawn on its little round head.
 */
export type MascotHead = {
  /** The head's centre line. */
  x: number;
  /** Where the head's outline crosses the centre line: the top of the skull. */
  top: number;
  /**
   * Where an accessory's lower edge rests: a little into the head, so a hat sits on it
   * rather than hovering. The hat is drawn over the body and under the eyes.
   */
  seat: number;
  /** Half the head's width a little below `top`: how wide a hat may be before it overhangs. */
  w: number;
  /** The ear line, where side pieces hang (headphones, earmuffs, a flower). */
  ear: number;
  /** Half the body's width at the ear line. */
  side: number;
  /** A size unit, the face's own scale (1 on the circle): scale an accessory's details by it. */
  k: number;
};

/**
 * Explicit anchors for shapes where the derived ones are wrong: a body whose top is a
 * flame, a stalk or a hat of its own. Anything not given here is derived from the
 * distance field by `deriveHead`, so a new shape gets sensible anchors for free and only
 * needs an entry here if the sheet shows a hat in the wrong place.
 */
export const HEAD: Partial<Record<MascotShapeId, Partial<Pick<MascotHead, "x" | "top" | "w" | "ear" | "side">>>> = {
  // Side-on animals whose face is on the body and whose head is up a neck: the hat goes
  // on the head, where a person would put it, not on the middle of the back.
  dino: { x: -0.66, top: -0.77, w: 0.24, ear: -0.6, side: 0.26 },
  goose: { x: -0.46, top: -0.8, w: 0.22, ear: -0.56, side: 0.24 },
  seal: { x: -0.24, top: -0.66, w: 0.3, ear: -0.4, side: 0.36 },
  /* Faces whose eyes sit so high that the old ceiling (nothing drawn inside the body
     above the highest eye mark, retired the same day) was ABOVE the derived seat, so every
     cell of a hat inside the body was dropped. Found on 6 Oct 2026 when the visibility
     check met the fifty-six new accessories: cat ears, bear ears and a flower drew nothing
     at all on the frog. Each entry puts the seat on the outline itself and narrows `w`
     off the frog's eye bumps and the peanut's and hippo's lobes. They are kept now that
     hats draw over the body, because a hat on the outline is still where it belongs and
     one sunk between the frog's eyes would sit in front of its face. */
  // Hats between the eye bumps, ears and wings out at the sides rather than in the dip.
  frog: { top: -0.32, w: 0.36, ear: -0.1, side: 0.9 },
  peanut: { top: -0.28, w: 0.36 },
  hippo: { top: -0.62, w: 0.4 },
  // On the nose cone's tip; derived, the head was the wide part halfway down it.
  rocket: { top: -0.76, w: 0.24 },
  // On the tallest sticks, which is where a hat on a carton of fries would rest.
  fries: { top: -0.6, w: 0.55 },
  // The outline at the head's own centre line, which the 0.18 chord rule steps past on a
  // body that tapers to its top.
  fish: { top: -0.29 },
  cake: { top: -0.06 },
  // Side pieces above the solar panels; at the derived ear line wings hid behind them.
  satellite: { ear: -0.1 },
};

/** How far a hat sinks into the head below `top`. */
const SINK = 0.1;

/**
 * The half-width of the body along the row `y`, in the run of cells that contains `x`;
 * 0 when `x` itself is outside. Scans in steps of 0.01, which is a third of a cell at the
 * largest grid the product draws.
 */
function chord(shape: MascotShapeId, x: number, y: number) {
  if (sdShape(shape, x, y, 0) >= 0) return 0;
  let l = x, r = x;
  while (l > -1.4 && sdShape(shape, l - 0.01, y, 0) < 0) l -= 0.01;
  while (r < 1.4 && sdShape(shape, r + 0.01, y, 0) < 0) r += 0.01;
  return (r - l) / 2;
}

const headCache = new Map<MascotShapeId, MascotHead>();

/**
 * Anchors from the shape itself. The top is the first row, scanning down the face's
 * centre line, where the body is at least 0.18 wide on either side of it, which steps
 * over a stalk, a fuse, a flame or the tip of a wizard's hat and lands on the mass a
 * hat could actually sit on.
 */
export function deriveHead(shape: MascotShapeId): MascotHead {
  const cached = headCache.get(shape);
  if (cached) return cached;
  const face = FACE[shape];
  const given = HEAD[shape] ?? {};
  const x = given.x ?? face.x;
  let top = given.top;
  if (top === undefined) {
    top = face.y;
    for (let y = -1.2; y < face.y; y += 0.01) {
      if (chord(shape, x, y) >= 0.18) {
        top = y;
        break;
      }
    }
  }
  const w = given.w ?? Math.max(0.24, chord(shape, x, top + 0.22));
  const ear = given.ear ?? face.y - 0.13 * face.s;
  const side = given.side ?? Math.max(0.2, chord(shape, x, ear));
  /* The scale an accessory is drawn at: the face's, but never under 0.8. At the face's
     own scale a small head (cactus, ufo, rocket, moon) left a hat four cells tall at
     navbar size, and 54 accessory and shape pairs drew nothing at all. The rule since 6 Oct
     2026: every accessory has to work on every shape. The dressed frame has the room. */
  const head = { x, top, seat: top + SINK, w, ear, side, k: Math.max(face.s, 0.8) };
  headCache.set(shape, head);
  return head;
}

/** The head for a look and pose, blended across a morph the way the face is. */
export function headAnchor(look: MascotLook, pose: MascotPose): MascotHead {
  const to = deriveHead(look.shape);
  if (!pose.fromShape || pose.morph >= 1) return to;
  const from = deriveHead(pose.fromShape);
  const m = pose.morph;
  return {
    x: lerp(from.x, to.x, m),
    top: lerp(from.top, to.top, m),
    seat: lerp(from.seat, to.seat, m),
    w: lerp(from.w, to.w, m),
    ear: lerp(from.ear, to.ear, m),
    side: lerp(from.side, to.side, m),
    k: lerp(from.k, to.k, m),
  };
}
