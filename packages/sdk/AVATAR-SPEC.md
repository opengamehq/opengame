# OG style spec

<!-- npm-only -->
This file ships with `@opengamehq/sdk`. The same text is on docs.opengame.io under "Avatar style spec". `scripts/avatar-spec.mjs` in the OpenGame repository writes the tables from OpenGame's character catalogue, so do not edit them by hand.

<!-- /npm-only -->
An OG is a player's OpenGame character, a big head with two tall eyes on a small body. `og.player.avatar` gives your game two recipes, and `readAvatar` from `@opengamehq/sdk/avatar` names the parts in them. This spec describes each part, so you can draw an OG in any engine and any art style and the player still recognizes it.

The numbers and colors below come from the code OpenGame draws OGs with.

## What makes it an OG

Keep these the same in every style:

1. **A big head on a small body.** The head is the broadest part and about 40% of the figure's height. Do not shrink it toward human proportions.
2. **The head's outline and color.** A player recognizes the color first, at any distance. Use the hex values in the head palette.
3. **A face made of eyes.** Leave out the nose, and ears too unless the outline has them. Leave out the mouth, except where facial hair reaches the mouth line: there the mouth is a gap in the hair, as described under facial hair. Draw the eyes in the eye color from the head palette, which is dark on a pale head and white on a dark one.
4. **One color for the head and the skin.** The neck, the mittens and any uncovered limb are the head's color. An OG has no separate skin tone.
5. **Mittens.** A thumb and one rounded form for the fingers.
6. **The outfit as chosen.** Each garment in its color, and the accessories in the places listed below.
7. **The rest pose.** Upright and facing you, the upper limbs angled slightly out, the eyes glancing down and to your left.

These can change with your art style:

- **The rendering.** Pixel art, flat, toon, voxel, low poly or physically based. OpenGame uses dithered pixel art for heads in 2D and smooth lit surfaces in 3D.
- **Shading.** Use the five tones below or your engine's lighting.
- **Detail.** Pockets, seams, laces and creases are optional. Simplify a garment as far as you like and keep the outline and the color.
- **Proportions, a little.** Stay within about 10% of the tables, and scale the full figure by one factor.
- **Patterned and metallic colors.** A texture, a shader or the plain hex value.
- **Motion.** Blinks, glances, squash and stretch, and your animation. Keep the rest pose as described.

## Units and axes

Lengths are in **H**, the height of the default head. The feet are at 0, +Y is up and the OG faces +Z. When the OG faces you, the OG's right side is on your left.

The flat drawings of the head (its outline, markings, eyes, accessories and facial hair) and the anchors that place them are in **portrait units** instead, with x to the right and y down, as in the portrait image. <!-- avatar-spec:portrait-units -->
The bare portrait's square runs from -1.00 to 1.00 across and -1.00 to 1.00 down. A look wearing a head accessory is drawn in a larger square at the same scale, -1.20 to 1.20 across and -1.40 to 1.00 down, with the floor at the same height and room above for a hat. The default round head is 1.68 portrait units tall, so one portrait unit is 0.60 H.
<!-- /avatar-spec:portrait-units -->

## Proportions

These are for the default OG, the `classic` body with `regular` legs.

<!-- avatar-spec:proportions -->
| Measure | In H |
| --- | --- |
| Head height (the unit) | 1.00 |
| Head width | 1.00 |
| Head depth, front to back, at the middle | 0.86 |
| Head middle, above the feet | 1.99 |
| Head middle, above the top of the torso | 0.46 |
| Neck radius, a short column under the head | 0.12 |
| Torso width, side to side | 0.68 |
| Torso height, hip to collar | 0.77 |
| Torso depth, front to back | 0.48 |
| Shoulder joint, above the feet | 1.41 |
| Shoulder joint, out from the middle line | 0.32 |
| Shoulder to elbow | 0.33 |
| Elbow to wrist | 0.31 |
| Limb radius | 0.10 |
| Rest angle of the upper limbs, out from the body | 8 degrees |
| Mitten length | 0.17 |
| Hip joint, above the feet | 0.77 |
| Hip joint, out from the middle line | 0.16 |
| Hip to ankle | 0.61 |
| Ankle, above the feet | 0.16 |
| Shoe length | 0.42 |
| Shoe width | 0.32 |
| Shoe height, sole and upper | 0.21 |
| Feet to the top of the head | 2.49 |
<!-- /avatar-spec:proportions -->

The torso is a rounded column, narrow at the collar and the hem and broadest at the chest, with an oval cross-section as deep as the torso depth. The radius at each height, from the hem up:

<!-- avatar-spec:torso -->
| Height up the torso | Radius, as a share of half the torso width |
| --- | --- |
| 0.00 | 0.66 |
| 0.03 | 0.79 |
| 0.10 | 0.88 |
| 0.27 | 0.96 |
| 0.47 | 1.00 |
| 0.65 | 0.99 |
| 0.79 | 0.92 |
| 0.88 | 0.77 |
| 0.96 | 0.50 |
| 1.00 | 0.34 |
<!-- /avatar-spec:torso -->

The limbs are capsules, an upper and a lower part for each, hung from the shoulder and hip joints. The head rests on a short neck, with the lowest point of the head just inside the collar.

### Bodies

`body` sets the torso and the limb thickness. The figure height is with `regular` legs.

<!-- avatar-spec:bodies -->
| Id | Label | Torso width | Torso height | Torso depth | Limb radius | Figure height |
| --- | --- | --- | --- | --- | --- | --- |
| `sprout` | Sprout | 0.62 | 0.62 | 0.45 | 0.09 | 2.35 |
| `classic` | Classic | 0.68 | 0.77 | 0.48 | 0.10 | 2.49 |
| `slim` | Slim | 0.54 | 0.83 | 0.39 | 0.09 | 2.55 |
| `round` | Round | 0.84 | 0.72 | 0.57 | 0.12 | 2.45 |
| `tall` | Tall | 0.65 | 0.95 | 0.45 | 0.09 | 2.68 |
<!-- /avatar-spec:bodies -->

### Legs

`legs` sets the distance from hip to ankle, with the `classic` body.

<!-- avatar-spec:legs -->
| Id | Label | Hip to ankle | Hip height |
| --- | --- | --- | --- |
| `short` | Short | 0.45 | 0.61 |
| `regular` | Regular | 0.61 | 0.77 |
| `long` | Long | 0.79 | 0.94 |
<!-- /avatar-spec:legs -->

Figure height, from the feet to the top of the default head, for each body and leg length:

<!-- avatar-spec:heights -->
| Body id | `short` | `regular` | `long` |
| --- | --- | --- | --- |
| `sprout` | 2.20 | 2.35 | 2.53 |
| `classic` | 2.34 | 2.49 | 2.67 |
| `slim` | 2.40 | 2.55 | 2.73 |
| `round` | 2.29 | 2.45 | 2.63 |
| `tall` | 2.52 | 2.68 | 2.86 |
<!-- /avatar-spec:heights -->

## The head

The look recipe is `shape.eyes.color`, then an optional accessory, `female` for the second face set, facial hair, a hair color and a facial hair color. `readAvatar` returns these as fields of `head`.

### Shape

The shape is the head's outline, and each one is pictured in the first table. Width and height are in H. Hairstyles are the outlines a photo of a person can become, and `circle` is a shaved head; a hairstyle's hair is a marking inside its outline. "Markings" names the marking tone of a shape that has markings, which sets their color as described under "Edges and markings".

The second table places each outline and its eyes. Each outline stands on the default head's spot: "Middle, right" and "Bottom, up" are its offsets in H from the default head's middle line and lowest point. "Eyes up" places the middle of the eye pair, as a share of the outline's height up from its bottom, and "Eyes, right" is the distance right of the neck in H. "Eye scale" multiplies the eye sizes below.

The outlines themselves, the markings inside them, every eye style, every head accessory and every facial hair style are in `examples/avatar-threejs/og-spec.js` in the `@opengamehq/sdk` package, as cell masks generated from the same code as these tables. `OUTLINES` holds each head on a 64 by 64 grid over the bare portrait's square, `EYES` each eye style around the face anchor, `ACCESSORIES` each accessory in head units, `FACIAL_HAIR` each style in face units, and `ANCHORS` and `FACES` the points each shape places them by. The comments in that file give the encoding, and `og-model.js` beside it shows how to read them.

For a shape your game does not have, draw the default outline with the player's color and eyes.

<!-- avatar-spec:head-volume -->
In 3D the head is the outline inflated. At a point inside the outline `d` from the edge, in units where the default head's radius is 0.84, the head is `2 × √(0.62 × d)` thick: soft at the edge and nearly flat across the face.
<!-- /avatar-spec:head-volume -->

<!-- avatar-spec:shapes -->
| Picture | Id | Label | Hairstyle | Markings | Width | Height |
| --- | --- | --- | --- | --- | --- | --- |
| ![Circle](https://opengame.io/api/avatars/circle.classic.tangerine/portrait?size=64&theme=light&v=1) | `circle` |  | yes |  | 1.00 | 1.00 |
| ![Rounded square](https://opengame.io/api/avatars/square.classic.tangerine/portrait?size=64&theme=light&v=1) | `square` | Rounded square |  |  | 0.94 | 0.94 |
| ![Rounded rectangle](https://opengame.io/api/avatars/slab.classic.tangerine/portrait?size=64&theme=light&v=1) | `slab` | Rounded rectangle |  |  | 1.11 | 0.74 |
| ![Tall](https://opengame.io/api/avatars/tall.classic.tangerine/portrait?size=64&theme=light&v=1) | `tall` |  |  |  | 0.71 | 1.04 |
| ![Egg](https://opengame.io/api/avatars/egg.classic.tangerine/portrait?size=64&theme=light&v=1) | `egg` |  |  |  | 0.78 | 1.00 |
| ![Pebble](https://opengame.io/api/avatars/pebble.classic.tangerine/portrait?size=64&theme=light&v=1) | `pebble` |  |  |  | 1.10 | 0.77 |
| ![Bean](https://opengame.io/api/avatars/bean.classic.tangerine/portrait?size=64&theme=light&v=1) | `bean` |  |  |  | 0.96 | 0.90 |
| ![Drop](https://opengame.io/api/avatars/drop.classic.tangerine/portrait?size=64&theme=light&v=1) | `drop` |  |  |  | 0.78 | 1.01 |
| ![Ghost](https://opengame.io/api/avatars/ghost.classic.tangerine/portrait?size=64&theme=light&v=1) | `ghost` |  |  |  | 0.90 | 0.98 |
| ![Cloud](https://opengame.io/api/avatars/puff.classic.tangerine/portrait?size=64&theme=light&v=1) | `puff` | Cloud |  |  | 0.94 | 0.99 |
| ![Flower](https://opengame.io/api/avatars/flower.classic.tangerine/portrait?size=64&theme=light&v=1) | `flower` |  |  |  | 0.98 | 0.96 |
| ![Star](https://opengame.io/api/avatars/star.classic.tangerine/portrait?size=64&theme=light&v=1) | `star` |  |  |  | 0.96 | 0.92 |
| ![Heart](https://opengame.io/api/avatars/heart.classic.tangerine/portrait?size=64&theme=light&v=1) | `heart` |  |  |  | 1.13 | 1.03 |
| ![Diamond](https://opengame.io/api/avatars/diamond.classic.tangerine/portrait?size=64&theme=light&v=1) | `diamond` |  |  |  | 1.12 | 1.16 |
| ![Hexagon](https://opengame.io/api/avatars/hexagon.classic.tangerine/portrait?size=64&theme=light&v=1) | `hexagon` |  |  |  | 1.08 | 0.96 |
| ![Cat](https://opengame.io/api/avatars/cat.classic.tangerine/portrait?size=64&theme=light&v=1) | `cat` |  |  |  | 0.88 | 1.04 |
| ![Bear](https://opengame.io/api/avatars/bear.classic.tangerine/portrait?size=64&theme=light&v=1) | `bear` |  |  |  | 0.92 | 0.94 |
| ![Sprout](https://opengame.io/api/avatars/sprout.classic.tangerine/portrait?size=64&theme=light&v=1) | `sprout` |  |  |  | 0.85 | 1.07 |
| ![Bunny](https://opengame.io/api/avatars/bunny.classic.tangerine/portrait?size=64&theme=light&v=1) | `bunny` |  |  |  | 0.76 | 1.02 |
| ![Devil](https://opengame.io/api/avatars/devil.classic.tangerine/portrait?size=64&theme=light&v=1) | `devil` |  |  |  | 0.96 | 1.06 |
| ![Alien](https://opengame.io/api/avatars/alien.classic.tangerine/portrait?size=64&theme=light&v=1) | `alien` |  |  |  | 0.97 | 1.07 |
| ![Mushroom](https://opengame.io/api/avatars/mushroom.classic.tangerine/portrait?size=64&theme=light&v=1) | `mushroom` |  |  |  | 1.12 | 0.96 |
| ![Onigiri](https://opengame.io/api/avatars/onigiri.classic.tangerine/portrait?size=64&theme=light&v=1) | `onigiri` |  |  |  | 1.06 | 0.95 |
| ![Slime](https://opengame.io/api/avatars/slime.classic.tangerine/portrait?size=64&theme=light&v=1) | `slime` |  |  |  | 1.03 | 0.87 |
| ![Pear](https://opengame.io/api/avatars/pear.classic.tangerine/portrait?size=64&theme=light&v=1) | `pear` |  |  |  | 0.67 | 0.94 |
| ![Spiky](https://opengame.io/api/avatars/spiky.classic.tangerine/portrait?size=64&theme=light&v=1) | `spiky` |  |  |  | 0.92 | 0.96 |
| ![Pill](https://opengame.io/api/avatars/pill.classic.tangerine/portrait?size=64&theme=light&v=1) | `pill` |  |  |  | 0.62 | 1.03 |
| ![Dome](https://opengame.io/api/avatars/dome.classic.tangerine/portrait?size=64&theme=light&v=1) | `dome` |  |  |  | 1.12 | 0.95 |
| ![Blob](https://opengame.io/api/avatars/blob.classic.tangerine/portrait?size=64&theme=light&v=1) | `blob` |  |  |  | 0.94 | 0.90 |
| ![Moon](https://opengame.io/api/avatars/moon.classic.tangerine/portrait?size=64&theme=light&v=1) | `moon` |  |  |  | 0.94 | 0.97 |
| ![Octagon](https://opengame.io/api/avatars/octagon.classic.tangerine/portrait?size=64&theme=light&v=1) | `octagon` |  |  |  | 0.88 | 0.88 |
| ![Gem](https://opengame.io/api/avatars/gem.classic.tangerine/portrait?size=64&theme=light&v=1) | `gem` |  |  |  | 1.10 | 0.92 |
| ![Shield](https://opengame.io/api/avatars/shield.classic.tangerine/portrait?size=64&theme=light&v=1) | `shield` |  |  |  | 0.93 | 1.00 |
| ![Lemon](https://opengame.io/api/avatars/lemon.classic.tangerine/portrait?size=64&theme=light&v=1) | `lemon` |  |  |  | 1.17 | 0.69 |
| ![Apple](https://opengame.io/api/avatars/apple.classic.tangerine/portrait?size=64&theme=light&v=1) | `apple` |  |  |  | 0.96 | 0.96 |
| ![Pumpkin](https://opengame.io/api/avatars/pumpkin.classic.tangerine/portrait?size=64&theme=light&v=1) | `pumpkin` |  |  |  | 1.10 | 0.95 |
| ![Acorn](https://opengame.io/api/avatars/acorn.classic.tangerine/portrait?size=64&theme=light&v=1) | `acorn` |  |  |  | 1.00 | 1.08 |
| ![Cactus](https://opengame.io/api/avatars/cactus.classic.tangerine/portrait?size=64&theme=light&v=1) | `cactus` |  |  |  | 0.94 | 0.96 |
| ![Flame](https://opengame.io/api/avatars/flame.classic.tangerine/portrait?size=64&theme=light&v=1) | `flame` |  |  |  | 0.65 | 1.05 |
| ![Snowman](https://opengame.io/api/avatars/snowman.classic.tangerine/portrait?size=64&theme=light&v=1) | `snowman` |  |  |  | 0.60 | 1.02 |
| ![Dumpling](https://opengame.io/api/avatars/dumpling.classic.tangerine/portrait?size=64&theme=light&v=1) | `dumpling` |  |  |  | 1.12 | 0.79 |
| ![Bell](https://opengame.io/api/avatars/bell.classic.tangerine/portrait?size=64&theme=light&v=1) | `bell` |  |  |  | 1.03 | 1.19 |
| ![UFO](https://opengame.io/api/avatars/ufo.classic.tangerine/portrait?size=64&theme=light&v=1) | `ufo` | UFO |  |  | 1.13 | 0.69 |
| ![Robot](https://opengame.io/api/avatars/robot.classic.tangerine/portrait?size=64&theme=light&v=1) | `robot` |  |  |  | 1.07 | 0.98 |
| ![Crown](https://opengame.io/api/avatars/crown.classic.tangerine/portrait?size=64&theme=light&v=1) | `crown` |  |  |  | 0.76 | 1.06 |
| ![Unicorn](https://opengame.io/api/avatars/unicorn.classic.tangerine/portrait?size=64&theme=light&v=1) | `unicorn` |  |  |  | 0.88 | 1.09 |
| ![Fox](https://opengame.io/api/avatars/fox.classic.tangerine/portrait?size=64&theme=light&v=1) | `fox` |  |  |  | 0.90 | 0.96 |
| ![Mouse](https://opengame.io/api/avatars/mouse.classic.tangerine/portrait?size=64&theme=light&v=1) | `mouse` |  |  |  | 1.04 | 0.91 |
| ![Frog](https://opengame.io/api/avatars/frog.classic.tangerine/portrait?size=64&theme=light&v=1) | `frog` |  |  |  | 1.10 | 0.79 |
| ![Chick](https://opengame.io/api/avatars/chick.classic.tangerine/portrait?size=64&theme=light&v=1) | `chick` |  |  |  | 0.85 | 1.03 |
| ![Octopus](https://opengame.io/api/avatars/octopus.classic.tangerine/portrait?size=64&theme=light&v=1) | `octopus` |  |  |  | 0.93 | 0.97 |
| ![Jellyfish](https://opengame.io/api/avatars/jellyfish.classic.tangerine/portrait?size=64&theme=light&v=1) | `jellyfish` |  |  |  | 0.97 | 0.86 |
| ![Pentagon](https://opengame.io/api/avatars/pentagon.classic.tangerine/portrait?size=64&theme=light&v=1) | `pentagon` |  |  |  | 1.01 | 0.96 |
| ![Plus](https://opengame.io/api/avatars/plus.classic.tangerine/portrait?size=64&theme=light&v=1) | `plus` |  |  |  | 1.03 | 1.00 |
| ![Peanut](https://opengame.io/api/avatars/peanut.classic.tangerine/portrait?size=64&theme=light&v=1) | `peanut` |  |  |  | 1.04 | 0.69 |
| ![Leaf](https://opengame.io/api/avatars/leaf.classic.tangerine/portrait?size=64&theme=light&v=1) | `leaf` |  |  |  | 0.75 | 0.92 |
| ![Shell](https://opengame.io/api/avatars/shell.classic.tangerine/portrait?size=64&theme=light&v=1) | `shell` |  |  |  | 0.97 | 0.94 |
| ![Tulip](https://opengame.io/api/avatars/tulip.classic.tangerine/portrait?size=64&theme=light&v=1) | `tulip` |  |  |  | 0.81 | 1.08 |
| ![Penguin](https://opengame.io/api/avatars/penguin.classic.tangerine/portrait?size=64&theme=light&v=1) | `penguin` |  |  |  | 0.94 | 0.97 |
| ![Owl](https://opengame.io/api/avatars/owl.classic.tangerine/portrait?size=64&theme=light&v=1) | `owl` |  |  |  | 1.04 | 0.94 |
| ![Pig](https://opengame.io/api/avatars/pig.classic.tangerine/portrait?size=64&theme=light&v=1) | `pig` |  |  |  | 1.07 | 0.85 |
| ![Koala](https://opengame.io/api/avatars/koala.classic.tangerine/portrait?size=64&theme=light&v=1) | `koala` |  |  |  | 1.15 | 0.75 |
| ![Hamster](https://opengame.io/api/avatars/hamster.classic.tangerine/portrait?size=64&theme=light&v=1) | `hamster` |  |  |  | 1.03 | 0.83 |
| ![Puppy](https://opengame.io/api/avatars/puppy.classic.tangerine/portrait?size=64&theme=light&v=1) | `puppy` |  |  |  | 1.03 | 0.81 |
| ![Bat](https://opengame.io/api/avatars/bat.classic.tangerine/portrait?size=64&theme=light&v=1) | `bat` |  |  |  | 1.17 | 0.89 |
| ![Hedgehog](https://opengame.io/api/avatars/hedgehog.classic.tangerine/portrait?size=64&theme=light&v=1) | `hedgehog` |  |  |  | 1.08 | 0.80 |
| ![Axolotl](https://opengame.io/api/avatars/axolotl.classic.tangerine/portrait?size=64&theme=light&v=1) | `axolotl` |  |  |  | 1.22 | 0.86 |
| ![Hatchling](https://opengame.io/api/avatars/hatch.classic.tangerine/portrait?size=64&theme=light&v=1) | `hatch` | Hatchling |  |  | 0.88 | 0.92 |
| ![Bee](https://opengame.io/api/avatars/bee.classic.tangerine/portrait?size=64&theme=light&v=1) | `bee` |  |  |  | 1.04 | 0.96 |
| ![Snail](https://opengame.io/api/avatars/snail.classic.tangerine/portrait?size=64&theme=light&v=1) | `snail` |  |  |  | 1.12 | 0.75 |
| ![Turtle](https://opengame.io/api/avatars/turtle.classic.tangerine/portrait?size=64&theme=light&v=1) | `turtle` |  |  |  | 1.04 | 0.75 |
| ![Crab](https://opengame.io/api/avatars/crab.classic.tangerine/portrait?size=64&theme=light&v=1) | `crab` |  |  |  | 1.12 | 0.90 |
| ![Fish](https://opengame.io/api/avatars/fish.classic.tangerine/portrait?size=64&theme=light&v=1) | `fish` |  |  |  | 1.11 | 0.71 |
| ![Whale](https://opengame.io/api/avatars/whale.classic.tangerine/portrait?size=64&theme=light&v=1) | `whale` |  |  |  | 1.18 | 0.89 |
| ![Shark](https://opengame.io/api/avatars/shark.classic.tangerine/portrait?size=64&theme=light&v=1) | `shark` |  |  |  | 1.09 | 0.92 |
| ![Strawberry](https://opengame.io/api/avatars/strawberry.classic.tangerine/portrait?size=64&theme=light&v=1) | `strawberry` |  |  |  | 0.78 | 1.08 |
| ![Pineapple](https://opengame.io/api/avatars/pineapple.classic.tangerine/portrait?size=64&theme=light&v=1) | `pineapple` |  |  |  | 0.74 | 1.08 |
| ![Cupcake](https://opengame.io/api/avatars/cupcake.classic.tangerine/portrait?size=64&theme=light&v=1) | `cupcake` |  |  |  | 0.97 | 1.03 |
| ![Ice cream](https://opengame.io/api/avatars/icecream.classic.tangerine/portrait?size=64&theme=light&v=1) | `icecream` | Ice cream |  |  | 0.83 | 0.97 |
| ![Pudding](https://opengame.io/api/avatars/pudding.classic.tangerine/portrait?size=64&theme=light&v=1) | `pudding` |  |  |  | 1.12 | 0.81 |
| ![Toast](https://opengame.io/api/avatars/toast.classic.tangerine/portrait?size=64&theme=light&v=1) | `toast` |  |  |  | 0.99 | 0.93 |
| ![Burger](https://opengame.io/api/avatars/burger.classic.tangerine/portrait?size=64&theme=light&v=1) | `burger` |  |  |  | 1.07 | 0.96 |
| ![Bowl](https://opengame.io/api/avatars/bowl.classic.tangerine/portrait?size=64&theme=light&v=1) | `bowl` |  |  |  | 1.04 | 0.67 |
| ![Mitten](https://opengame.io/api/avatars/mitten.classic.tangerine/portrait?size=64&theme=light&v=1) | `mitten` |  |  |  | 0.92 | 0.91 |
| ![Tooth](https://opengame.io/api/avatars/tooth.classic.tangerine/portrait?size=64&theme=light&v=1) | `tooth` |  |  |  | 0.90 | 0.94 |
| ![Candle](https://opengame.io/api/avatars/candle.classic.tangerine/portrait?size=64&theme=light&v=1) | `candle` |  |  |  | 0.69 | 1.08 |
| ![Light bulb](https://opengame.io/api/avatars/bulb.classic.tangerine/portrait?size=64&theme=light&v=1) | `bulb` | Light bulb |  |  | 0.76 | 0.98 |
| ![Mug](https://opengame.io/api/avatars/mug.classic.tangerine/portrait?size=64&theme=light&v=1) | `mug` |  |  |  | 0.95 | 0.79 |
| ![Potion](https://opengame.io/api/avatars/potion.classic.tangerine/portrait?size=64&theme=light&v=1) | `potion` |  |  |  | 0.74 | 1.03 |
| ![Balloon](https://opengame.io/api/avatars/balloon.classic.tangerine/portrait?size=64&theme=light&v=1) | `balloon` |  |  |  | 0.78 | 1.36 |
| ![Present](https://opengame.io/api/avatars/present.classic.tangerine/portrait?size=64&theme=light&v=1) | `present` |  |  |  | 0.97 | 0.87 |
| ![Padlock](https://opengame.io/api/avatars/padlock.classic.tangerine/portrait?size=64&theme=light&v=1) | `padlock` |  |  |  | 0.88 | 0.90 |
| ![House](https://opengame.io/api/avatars/house.classic.tangerine/portrait?size=64&theme=light&v=1) | `house` |  |  |  | 1.07 | 0.96 |
| ![TV](https://opengame.io/api/avatars/tv.classic.tangerine/portrait?size=64&theme=light&v=1) | `tv` | TV |  |  | 1.04 | 1.04 |
| ![Gamepad](https://opengame.io/api/avatars/gamepad.classic.tangerine/portrait?size=64&theme=light&v=1) | `gamepad` |  |  |  | 1.08 | 0.61 |
| ![Trophy](https://opengame.io/api/avatars/trophy.classic.tangerine/portrait?size=64&theme=light&v=1) | `trophy` |  |  |  | 1.03 | 0.90 |
| ![Chest](https://opengame.io/api/avatars/chest.classic.tangerine/portrait?size=64&theme=light&v=1) | `chest` |  |  |  | 1.04 | 0.71 |
| ![Bomb](https://opengame.io/api/avatars/bomb.classic.tangerine/portrait?size=64&theme=light&v=1) | `bomb` |  |  |  | 0.84 | 1.07 |
| ![Pawn](https://opengame.io/api/avatars/pawn.classic.tangerine/portrait?size=64&theme=light&v=1) | `pawn` |  |  |  | 0.79 | 1.12 |
| ![Spade](https://opengame.io/api/avatars/spade.classic.tangerine/portrait?size=64&theme=light&v=1) | `spade` |  |  |  | 0.92 | 0.97 |
| ![Club](https://opengame.io/api/avatars/club.classic.tangerine/portrait?size=64&theme=light&v=1) | `club` |  |  |  | 0.92 | 0.96 |
| ![Wizard](https://opengame.io/api/avatars/wizard.classic.tangerine/portrait?size=64&theme=light&v=1) | `wizard` |  |  |  | 0.99 | 1.10 |
| ![Rocket](https://opengame.io/api/avatars/rocket.classic.tangerine/portrait?size=64&theme=light&v=1) | `rocket` |  |  |  | 0.88 | 0.96 |
| ![Planet](https://opengame.io/api/avatars/planet.classic.tangerine/portrait?size=64&theme=light&v=1) | `planet` |  |  |  | 1.28 | 0.74 |
| ![Panda](https://opengame.io/api/avatars/panda.classic.tangerine/portrait?size=64&theme=light&v=1) | `panda` |  |  | contrast | 0.97 | 0.90 |
| ![Ladybug](https://opengame.io/api/avatars/ladybug.classic.tangerine/portrait?size=64&theme=light&v=1) | `ladybug` |  |  | contrast | 1.03 | 1.04 |
| ![Elephant](https://opengame.io/api/avatars/elephant.classic.tangerine/portrait?size=64&theme=light&v=1) | `elephant` |  |  |  | 1.15 | 0.81 |
| ![Lion](https://opengame.io/api/avatars/lion.classic.tangerine/portrait?size=64&theme=light&v=1) | `lion` |  |  |  | 0.94 | 0.97 |
| ![Sheep](https://opengame.io/api/avatars/sheep.classic.tangerine/portrait?size=64&theme=light&v=1) | `sheep` |  |  |  | 1.08 | 0.79 |
| ![Cow](https://opengame.io/api/avatars/cow.classic.tangerine/portrait?size=64&theme=light&v=1) | `cow` |  |  | contrast | 1.15 | 1.02 |
| ![Duck](https://opengame.io/api/avatars/duck.classic.tangerine/portrait?size=64&theme=light&v=1) | `duck` |  |  |  | 1.14 | 0.94 |
| ![Seal](https://opengame.io/api/avatars/seal.classic.tangerine/portrait?size=64&theme=light&v=1) | `seal` |  |  |  | 0.88 | 0.90 |
| ![Dragon](https://opengame.io/api/avatars/dragon.classic.tangerine/portrait?size=64&theme=light&v=1) | `dragon` |  |  |  | 1.12 | 1.03 |
| ![Dinosaur](https://opengame.io/api/avatars/dino.classic.tangerine/portrait?size=64&theme=light&v=1) | `dino` | Dinosaur |  |  | 1.14 | 0.97 |
| ![Deer](https://opengame.io/api/avatars/deer.classic.tangerine/portrait?size=64&theme=light&v=1) | `deer` |  |  |  | 0.97 | 1.07 |
| ![Giraffe](https://opengame.io/api/avatars/giraffe.classic.tangerine/portrait?size=64&theme=light&v=1) | `giraffe` |  |  | contrast | 0.94 | 1.04 |
| ![Monkey](https://opengame.io/api/avatars/monkey.classic.tangerine/portrait?size=64&theme=light&v=1) | `monkey` |  |  | light | 1.12 | 0.89 |
| ![Mole](https://opengame.io/api/avatars/mole.classic.tangerine/portrait?size=64&theme=light&v=1) | `mole` |  |  |  | 1.12 | 0.76 |
| ![Squid](https://opengame.io/api/avatars/squid.classic.tangerine/portrait?size=64&theme=light&v=1) | `squid` |  |  |  | 0.71 | 0.96 |
| ![Manta ray](https://opengame.io/api/avatars/ray.classic.tangerine/portrait?size=64&theme=light&v=1) | `ray` | Manta ray |  |  | 1.14 | 0.88 |
| ![Butterfly](https://opengame.io/api/avatars/butterfly.classic.tangerine/portrait?size=64&theme=light&v=1) | `butterfly` |  |  |  | 1.06 | 1.04 |
| ![Spider](https://opengame.io/api/avatars/spider.classic.tangerine/portrait?size=64&theme=light&v=1) | `spider` |  |  |  | 1.12 | 1.10 |
| ![Caterpillar](https://opengame.io/api/avatars/caterpillar.classic.tangerine/portrait?size=64&theme=light&v=1) | `caterpillar` |  |  |  | 1.09 | 0.99 |
| ![Yeti](https://opengame.io/api/avatars/yeti.classic.tangerine/portrait?size=64&theme=light&v=1) | `yeti` |  |  |  | 1.17 | 1.04 |
| ![Goose](https://opengame.io/api/avatars/goose.classic.tangerine/portrait?size=64&theme=light&v=1) | `goose` |  |  |  | 1.13 | 0.99 |
| ![Toucan](https://opengame.io/api/avatars/toucan.classic.tangerine/portrait?size=64&theme=light&v=1) | `toucan` |  |  |  | 1.06 | 0.77 |
| ![Parrot](https://opengame.io/api/avatars/parrot.classic.tangerine/portrait?size=64&theme=light&v=1) | `parrot` |  |  |  | 0.80 | 1.10 |
| ![Rhino](https://opengame.io/api/avatars/rhino.classic.tangerine/portrait?size=64&theme=light&v=1) | `rhino` |  |  |  | 1.09 | 0.69 |
| ![Hippo](https://opengame.io/api/avatars/hippo.classic.tangerine/portrait?size=64&theme=light&v=1) | `hippo` |  |  |  | 0.99 | 0.88 |
| ![Llama](https://opengame.io/api/avatars/llama.classic.tangerine/portrait?size=64&theme=light&v=1) | `llama` |  |  |  | 0.62 | 1.10 |
| ![Camel](https://opengame.io/api/avatars/camel.classic.tangerine/portrait?size=64&theme=light&v=1) | `camel` |  |  |  | 1.05 | 0.77 |
| ![Ram](https://opengame.io/api/avatars/ram.classic.tangerine/portrait?size=64&theme=light&v=1) | `ram` |  |  |  | 1.10 | 0.74 |
| ![Walrus](https://opengame.io/api/avatars/walrus.classic.tangerine/portrait?size=64&theme=light&v=1) | `walrus` |  |  |  | 0.97 | 0.88 |
| ![Hen](https://opengame.io/api/avatars/hen.classic.tangerine/portrait?size=64&theme=light&v=1) | `hen` |  |  |  | 0.98 | 0.98 |
| ![Squirrel](https://opengame.io/api/avatars/squirrel.classic.tangerine/portrait?size=64&theme=light&v=1) | `squirrel` |  |  |  | 0.88 | 0.92 |
| ![Golem](https://opengame.io/api/avatars/golem.classic.tangerine/portrait?size=64&theme=light&v=1) | `golem` |  |  |  | 1.07 | 0.92 |
| ![Cherry](https://opengame.io/api/avatars/cherry.classic.tangerine/portrait?size=64&theme=light&v=1) | `cherry` |  |  |  | 0.89 | 1.01 |
| ![Banana](https://opengame.io/api/avatars/banana.classic.tangerine/portrait?size=64&theme=light&v=1) | `banana` |  |  |  | 1.03 | 0.72 |
| ![Carrot](https://opengame.io/api/avatars/carrot.classic.tangerine/portrait?size=64&theme=light&v=1) | `carrot` |  |  |  | 0.71 | 1.09 |
| ![Eggplant](https://opengame.io/api/avatars/eggplant.classic.tangerine/portrait?size=64&theme=light&v=1) | `eggplant` |  |  |  | 0.69 | 1.07 |
| ![Corn](https://opengame.io/api/avatars/corn.classic.tangerine/portrait?size=64&theme=light&v=1) | `corn` |  |  |  | 0.83 | 1.01 |
| ![Cookie](https://opengame.io/api/avatars/cookie.classic.tangerine/portrait?size=64&theme=light&v=1) | `cookie` |  |  |  | 0.96 | 0.97 |
| ![Macaron](https://opengame.io/api/avatars/macaron.classic.tangerine/portrait?size=64&theme=light&v=1) | `macaron` |  |  |  | 1.00 | 0.71 |
| ![Popsicle](https://opengame.io/api/avatars/popsicle.classic.tangerine/portrait?size=64&theme=light&v=1) | `popsicle` |  |  |  | 0.74 | 0.99 |
| ![Cake slice](https://opengame.io/api/avatars/cake.classic.tangerine/portrait?size=64&theme=light&v=1) | `cake` | Cake slice |  |  | 1.04 | 1.02 |
| ![Croissant](https://opengame.io/api/avatars/croissant.classic.tangerine/portrait?size=64&theme=light&v=1) | `croissant` |  |  |  | 1.10 | 0.64 |
| ![Bubble tea](https://opengame.io/api/avatars/boba.classic.tangerine/portrait?size=64&theme=light&v=1) | `boba` | Bubble tea |  |  | 0.76 | 1.06 |
| ![Pizza](https://opengame.io/api/avatars/pizza.classic.tangerine/portrait?size=64&theme=light&v=1) | `pizza` |  |  |  | 1.08 | 0.90 |
| ![Chili](https://opengame.io/api/avatars/chili.classic.tangerine/portrait?size=64&theme=light&v=1) | `chili` |  |  |  | 0.95 | 1.05 |
| ![Grapes](https://opengame.io/api/avatars/grapes.classic.tangerine/portrait?size=64&theme=light&v=1) | `grapes` |  |  |  | 0.96 | 1.05 |
| ![Radish](https://opengame.io/api/avatars/radish.classic.tangerine/portrait?size=64&theme=light&v=1) | `radish` |  |  |  | 0.69 | 1.08 |
| ![Popcorn](https://opengame.io/api/avatars/popcorn.classic.tangerine/portrait?size=64&theme=light&v=1) | `popcorn` |  |  |  | 0.79 | 0.99 |
| ![Fries](https://opengame.io/api/avatars/fries.classic.tangerine/portrait?size=64&theme=light&v=1) | `fries` |  |  |  | 0.81 | 1.05 |
| ![Hot dog](https://opengame.io/api/avatars/hotdog.classic.tangerine/portrait?size=64&theme=light&v=1) | `hotdog` | Hot dog |  |  | 1.13 | 0.62 |
| ![Candy](https://opengame.io/api/avatars/candy.classic.tangerine/portrait?size=64&theme=light&v=1) | `candy` |  |  |  | 1.17 | 0.64 |
| ![Teapot](https://opengame.io/api/avatars/teapot.classic.tangerine/portrait?size=64&theme=light&v=1) | `teapot` |  |  |  | 1.12 | 0.79 |
| ![Cauldron](https://opengame.io/api/avatars/cauldron.classic.tangerine/portrait?size=64&theme=light&v=1) | `cauldron` |  |  |  | 0.78 | 0.99 |
| ![Bottle](https://opengame.io/api/avatars/bottle.classic.tangerine/portrait?size=64&theme=light&v=1) | `bottle` |  |  |  | 0.64 | 1.02 |
| ![Jar](https://opengame.io/api/avatars/jar.classic.tangerine/portrait?size=64&theme=light&v=1) | `jar` |  |  |  | 0.83 | 0.93 |
| ![Hourglass](https://opengame.io/api/avatars/hourglass.classic.tangerine/portrait?size=64&theme=light&v=1) | `hourglass` |  |  |  | 0.79 | 1.04 |
| ![Lantern](https://opengame.io/api/avatars/lantern.classic.tangerine/portrait?size=64&theme=light&v=1) | `lantern` |  |  |  | 0.79 | 0.97 |
| ![Umbrella](https://opengame.io/api/avatars/umbrella.classic.tangerine/portrait?size=64&theme=light&v=1) | `umbrella` |  |  |  | 1.10 | 1.00 |
| ![Potted plant](https://opengame.io/api/avatars/plant.classic.tangerine/portrait?size=64&theme=light&v=1) | `plant` | Potted plant |  |  | 0.79 | 1.07 |
| ![Snow globe](https://opengame.io/api/avatars/globe.classic.tangerine/portrait?size=64&theme=light&v=1) | `globe` | Snow globe |  |  | 0.81 | 0.90 |
| ![Mailbox](https://opengame.io/api/avatars/mailbox.classic.tangerine/portrait?size=64&theme=light&v=1) | `mailbox` |  |  |  | 0.98 | 0.90 |
| ![Traffic cone](https://opengame.io/api/avatars/cone.classic.tangerine/portrait?size=64&theme=light&v=1) | `cone` | Traffic cone |  |  | 1.03 | 1.00 |
| ![Hydrant](https://opengame.io/api/avatars/hydrant.classic.tangerine/portrait?size=64&theme=light&v=1) | `hydrant` |  |  |  | 0.81 | 1.00 |
| ![Rain cloud](https://opengame.io/api/avatars/rain.classic.tangerine/portrait?size=64&theme=light&v=1) | `rain` | Rain cloud |  |  | 0.96 | 0.92 |
| ![Sun](https://opengame.io/api/avatars/sun.classic.tangerine/portrait?size=64&theme=light&v=1) | `sun` |  |  |  | 1.03 | 1.04 |
| ![Crystal](https://opengame.io/api/avatars/crystal.classic.tangerine/portrait?size=64&theme=light&v=1) | `crystal` |  |  |  | 1.07 | 1.07 |
| ![Tree](https://opengame.io/api/avatars/tree.classic.tangerine/portrait?size=64&theme=light&v=1) | `tree` |  |  |  | 0.96 | 1.01 |
| ![Pine](https://opengame.io/api/avatars/pine.classic.tangerine/portrait?size=64&theme=light&v=1) | `pine` |  |  |  | 1.08 | 1.08 |
| ![Volcano](https://opengame.io/api/avatars/volcano.classic.tangerine/portrait?size=64&theme=light&v=1) | `volcano` |  |  |  | 1.13 | 1.08 |
| ![Comet](https://opengame.io/api/avatars/comet.classic.tangerine/portrait?size=64&theme=light&v=1) | `comet` |  |  |  | 1.00 | 1.08 |
| ![Knight](https://opengame.io/api/avatars/knight.classic.tangerine/portrait?size=64&theme=light&v=1) | `knight` |  |  |  | 0.97 | 1.03 |
| ![Ninja](https://opengame.io/api/avatars/ninja.classic.tangerine/portrait?size=64&theme=light&v=1) | `ninja` |  |  | light | 1.01 | 0.84 |
| ![Tower](https://opengame.io/api/avatars/tower.classic.tangerine/portrait?size=64&theme=light&v=1) | `tower` |  |  |  | 0.81 | 0.95 |
| ![Lighthouse](https://opengame.io/api/avatars/lighthouse.classic.tangerine/portrait?size=64&theme=light&v=1) | `lighthouse` |  |  |  | 0.76 | 1.01 |
| ![Windmill](https://opengame.io/api/avatars/windmill.classic.tangerine/portrait?size=64&theme=light&v=1) | `windmill` |  |  |  | 0.90 | 1.09 |
| ![Camera](https://opengame.io/api/avatars/camera.classic.tangerine/portrait?size=64&theme=light&v=1) | `camera` |  |  |  | 1.07 | 0.73 |
| ![Joystick](https://opengame.io/api/avatars/joystick.classic.tangerine/portrait?size=64&theme=light&v=1) | `joystick` |  |  |  | 1.00 | 1.01 |
| ![Arcade cabinet](https://opengame.io/api/avatars/arcade.classic.tangerine/portrait?size=64&theme=light&v=1) | `arcade` | Arcade cabinet |  |  | 0.83 | 1.00 |
| ![Medal](https://opengame.io/api/avatars/medal.classic.tangerine/portrait?size=64&theme=light&v=1) | `medal` |  |  |  | 0.67 | 1.05 |
| ![Satellite](https://opengame.io/api/avatars/satellite.classic.tangerine/portrait?size=64&theme=light&v=1) | `satellite` |  |  |  | 1.14 | 1.04 |
| ![Tornado](https://opengame.io/api/avatars/tornado.classic.tangerine/portrait?size=64&theme=light&v=1) | `tornado` |  |  |  | 1.03 | 1.00 |
| ![Stump](https://opengame.io/api/avatars/stump.classic.tangerine/portrait?size=64&theme=light&v=1) | `stump` |  |  |  | 1.06 | 0.95 |
| ![Lamp](https://opengame.io/api/avatars/lamp.classic.tangerine/portrait?size=64&theme=light&v=1) | `lamp` |  |  |  | 0.99 | 1.04 |
| ![Alarm clock](https://opengame.io/api/avatars/alarm.classic.tangerine/portrait?size=64&theme=light&v=1) | `alarm` | Alarm clock |  |  | 0.85 | 0.97 |
| ![Hot air balloon](https://opengame.io/api/avatars/hotair.classic.tangerine/portrait?size=64&theme=light&v=1) | `hotair` | Hot air balloon |  |  | 0.81 | 1.06 |
| ![Car](https://opengame.io/api/avatars/car.classic.tangerine/portrait?size=64&theme=light&v=1) | `car` |  |  |  | 1.10 | 0.68 |
| ![Tugboat](https://opengame.io/api/avatars/boat.classic.tangerine/portrait?size=64&theme=light&v=1) | `boat` | Tugboat |  |  | 1.17 | 1.04 |
| ![Submarine](https://opengame.io/api/avatars/sub.classic.tangerine/portrait?size=64&theme=light&v=1) | `sub` | Submarine |  |  | 1.14 | 0.89 |
| ![Bone](https://opengame.io/api/avatars/bone.classic.tangerine/portrait?size=64&theme=light&v=1) | `bone` |  |  |  | 1.06 | 0.60 |
| ![Sock](https://opengame.io/api/avatars/sock.classic.tangerine/portrait?size=64&theme=light&v=1) | `sock` |  |  |  | 0.96 | 0.96 |
| ![T-shirt](https://opengame.io/api/avatars/tshirt.classic.tangerine/portrait?size=64&theme=light&v=1) | `tshirt` | T-shirt |  |  | 1.17 | 0.86 |
| ![Top hat](https://opengame.io/api/avatars/tophat.classic.tangerine/portrait?size=64&theme=light&v=1) | `tophat` | Top hat |  |  | 1.10 | 0.87 |
| ![Key](https://opengame.io/api/avatars/key.classic.tangerine/portrait?size=64&theme=light&v=1) | `key` |  |  |  | 0.69 | 1.00 |
| ![Raccoon](https://opengame.io/api/avatars/raccoon.classic.tangerine/portrait?size=64&theme=light&v=1) | `raccoon` |  |  | contrast | 1.15 | 0.92 |
| ![Tiger](https://opengame.io/api/avatars/tiger.classic.tangerine/portrait?size=64&theme=light&v=1) | `tiger` |  |  | contrast | 1.15 | 0.88 |
| ![Koi](https://opengame.io/api/avatars/koi.classic.tangerine/portrait?size=64&theme=light&v=1) | `koi` |  |  | contrast | 0.87 | 0.91 |
| ![Dalmatian](https://opengame.io/api/avatars/dalmatian.classic.tangerine/portrait?size=64&theme=light&v=1) | `dalmatian` |  |  | contrast | 0.97 | 0.81 |
| ![Zebra](https://opengame.io/api/avatars/zebra.classic.tangerine/portrait?size=64&theme=light&v=1) | `zebra` |  |  | contrast | 0.69 | 1.03 |
| ![Bearded bust](https://opengame.io/api/avatars/bust.classic.tangerine/portrait?size=64&theme=light&v=1) | `bust` | Bearded bust |  | dark | 0.74 | 1.02 |
| ![Mop top](https://opengame.io/api/avatars/moptop.classic.tangerine/portrait?size=64&theme=light&v=1) | `moptop` | Mop top | yes | dark | 1.05 | 1.05 |
| ![Spiky crop](https://opengame.io/api/avatars/spikecut.classic.tangerine/portrait?size=64&theme=light&v=1) | `spikecut` | Spiky crop | yes | dark | 0.89 | 0.96 |
| ![Side part](https://opengame.io/api/avatars/sidepart.classic.tangerine/portrait?size=64&theme=light&v=1) | `sidepart` | Side part | yes | grey | 0.89 | 1.10 |
| ![Pompadour](https://opengame.io/api/avatars/pompadour.classic.tangerine/portrait?size=64&theme=light&v=1) | `pompadour` |  | yes | dark | 0.78 | 1.11 |
| ![Sculpted head](https://opengame.io/api/avatars/sculpt.classic.tangerine/portrait?size=64&theme=light&v=1) | `sculpt` | Sculpted head |  |  | 0.77 | 1.03 |
| ![Brick pyramid](https://opengame.io/api/avatars/pyramid.classic.tangerine/portrait?size=64&theme=light&v=1) | `pyramid` | Brick pyramid |  | dark | 1.03 | 1.00 |
| ![Swept quiff](https://opengame.io/api/avatars/quiff.classic.tangerine/portrait?size=64&theme=light&v=1) | `quiff` | Swept quiff |  | dark | 0.83 | 1.09 |
| ![Full beard](https://opengame.io/api/avatars/fullbeard.classic.tangerine/portrait?size=64&theme=light&v=1) | `fullbeard` | Full beard |  | brown | 0.81 | 0.95 |
| ![Wavy hair](https://opengame.io/api/avatars/waves.classic.tangerine/portrait?size=64&theme=light&v=1) | `waves` | Wavy hair |  | dark | 0.98 | 1.03 |
| ![Moustache](https://opengame.io/api/avatars/tache.classic.tangerine/portrait?size=64&theme=light&v=1) | `tache` | Moustache |  | dark | 0.92 | 1.00 |
| ![Long hair](https://opengame.io/api/avatars/longhair.classic.tangerine/portrait?size=64&theme=light&v=1) | `longhair` | Long hair | yes | dark | 0.96 | 1.03 |
| ![Long waves](https://opengame.io/api/avatars/longwaves.classic.tangerine/portrait?size=64&theme=light&v=1) | `longwaves` | Long waves | yes | dark | 1.08 | 1.06 |
| ![Deep waves](https://opengame.io/api/avatars/deepwaves.classic.tangerine/portrait?size=64&theme=light&v=1) | `deepwaves` | Deep waves | yes | dark | 1.17 | 1.04 |
| ![Short fringe](https://opengame.io/api/avatars/shortfringe.classic.tangerine/portrait?size=64&theme=light&v=1) | `shortfringe` | Short fringe | yes | brown | 0.88 | 1.05 |
| ![Short curls](https://opengame.io/api/avatars/shortcurls.classic.tangerine/portrait?size=64&theme=light&v=1) | `shortcurls` | Short curls | yes | dark | 0.81 | 1.05 |
| ![Layered fringe](https://opengame.io/api/avatars/layeredfringe.classic.tangerine/portrait?size=64&theme=light&v=1) | `layeredfringe` | Layered fringe | yes | dark | 0.84 | 1.10 |
| ![Silk fringe](https://opengame.io/api/avatars/silkfringe.classic.tangerine/portrait?size=64&theme=light&v=1) | `silkfringe` | Silk fringe | yes | grey | 0.92 | 1.07 |
| ![Short quiff](https://opengame.io/api/avatars/shortquiff.classic.tangerine/portrait?size=64&theme=light&v=1) | `shortquiff` | Short quiff | yes | brown | 0.83 | 1.11 |
| ![Tousled crop](https://opengame.io/api/avatars/tousled.classic.tangerine/portrait?size=64&theme=light&v=1) | `tousled` | Tousled crop | yes | brown | 0.83 | 1.07 |
| ![Shaved and bearded](https://opengame.io/api/avatars/shavedbeard.classic.tangerine/portrait?size=64&theme=light&v=1) | `shavedbeard` | Shaved and bearded |  | dark | 0.86 | 0.93 |
| ![Buzz cut](https://opengame.io/api/avatars/buzzcut.classic.tangerine/portrait?size=64&theme=light&v=1) | `buzzcut` | Buzz cut | yes | dark | 0.85 | 0.89 |
| ![Crew cut](https://opengame.io/api/avatars/crewcut.classic.tangerine/portrait?size=64&theme=light&v=1) | `crewcut` | Crew cut | yes | brown | 0.85 | 0.99 |
| ![Receding hairline](https://opengame.io/api/avatars/receding.classic.tangerine/portrait?size=64&theme=light&v=1) | `receding` | Receding hairline | yes | dark | 0.85 | 0.92 |
| ![Slicked back](https://opengame.io/api/avatars/slickback.classic.tangerine/portrait?size=64&theme=light&v=1) | `slickback` | Slicked back | yes | brown | 0.86 | 1.09 |
| ![Faux hawk](https://opengame.io/api/avatars/fauxhawk.classic.tangerine/portrait?size=64&theme=light&v=1) | `fauxhawk` | Faux hawk | yes | dark | 0.85 | 1.12 |
| ![Pixie cut](https://opengame.io/api/avatars/pixie.classic.tangerine/portrait?size=64&theme=light&v=1) | `pixie` | Pixie cut | yes | dark | 0.83 | 0.93 |
| ![Cornrows](https://opengame.io/api/avatars/cornrows.classic.tangerine/portrait?size=64&theme=light&v=1) | `cornrows` |  | yes | dark | 0.85 | 0.90 |
| ![Curtains](https://opengame.io/api/avatars/curtains.classic.tangerine/portrait?size=64&theme=light&v=1) | `curtains` |  | yes | brown | 0.88 | 1.01 |
| ![Afro](https://opengame.io/api/avatars/afro.classic.tangerine/portrait?size=64&theme=light&v=1) | `afro` |  | yes | dark | 1.03 | 1.06 |
| ![Top knot](https://opengame.io/api/avatars/topknot.classic.tangerine/portrait?size=64&theme=light&v=1) | `topknot` | Top knot | yes | dark | 0.85 | 1.10 |
| ![Space buns](https://opengame.io/api/avatars/twinbuns.classic.tangerine/portrait?size=64&theme=light&v=1) | `twinbuns` | Space buns | yes | brown | 0.85 | 1.04 |
| ![Bob](https://opengame.io/api/avatars/bob.classic.tangerine/portrait?size=64&theme=light&v=1) | `bob` |  | yes | dark | 0.83 | 0.96 |
| ![Low ponytail](https://opengame.io/api/avatars/lowpony.classic.tangerine/portrait?size=64&theme=light&v=1) | `lowpony` | Low ponytail | yes | brown | 0.98 | 0.93 |
| ![Locs](https://opengame.io/api/avatars/locs.classic.tangerine/portrait?size=64&theme=light&v=1) | `locs` |  | yes | dark | 1.10 | 1.00 |
| ![Side-swept long](https://opengame.io/api/avatars/sideswept.classic.tangerine/portrait?size=64&theme=light&v=1) | `sideswept` | Side-swept long | yes | dark | 0.92 | 1.04 |
| ![Skin fade](https://opengame.io/api/avatars/skinfade.classic.tangerine/portrait?size=64&theme=light&v=1) | `skinfade` | Skin fade | yes | dark | 0.85 | 1.00 |
| ![Undercut](https://opengame.io/api/avatars/undercut.classic.tangerine/portrait?size=64&theme=light&v=1) | `undercut` |  | yes | dark | 0.85 | 1.12 |
| ![French crop](https://opengame.io/api/avatars/frenchcrop.classic.tangerine/portrait?size=64&theme=light&v=1) | `frenchcrop` | French crop | yes | dark | 0.85 | 0.96 |
| ![Mohawk](https://opengame.io/api/avatars/mohawk.classic.tangerine/portrait?size=64&theme=light&v=1) | `mohawk` |  | yes | dark | 0.85 | 1.12 |
| ![Long bob](https://opengame.io/api/avatars/lob.classic.tangerine/portrait?size=64&theme=light&v=1) | `lob` | Long bob | yes | brown | 0.86 | 0.97 |
| ![Blunt bangs](https://opengame.io/api/avatars/bluntbangs.classic.tangerine/portrait?size=64&theme=light&v=1) | `bluntbangs` | Blunt bangs | yes | dark | 0.94 | 0.96 |
| ![Curtain bangs](https://opengame.io/api/avatars/curtainbangs.classic.tangerine/portrait?size=64&theme=light&v=1) | `curtainbangs` | Curtain bangs | yes | brown | 1.12 | 1.02 |
| ![Shag](https://opengame.io/api/avatars/shag.classic.tangerine/portrait?size=64&theme=light&v=1) | `shag` |  | yes | brown | 1.01 | 0.94 |
| ![Long curls](https://opengame.io/api/avatars/longcurls.classic.tangerine/portrait?size=64&theme=light&v=1) | `longcurls` | Long curls | yes | dark | 1.22 | 1.04 |
| ![Afro puff](https://opengame.io/api/avatars/afropuff.classic.tangerine/portrait?size=64&theme=light&v=1) | `afropuff` | Afro puff | yes | dark | 0.85 | 1.10 |
| ![High ponytail](https://opengame.io/api/avatars/highpony.classic.tangerine/portrait?size=64&theme=light&v=1) | `highpony` | High ponytail | yes | dark | 0.90 | 1.09 |
| ![High bun](https://opengame.io/api/avatars/highbun.classic.tangerine/portrait?size=64&theme=light&v=1) | `highbun` | High bun | yes | brown | 0.85 | 1.10 |
| ![Messy bun](https://opengame.io/api/avatars/messybun.classic.tangerine/portrait?size=64&theme=light&v=1) | `messybun` | Messy bun | yes | brown | 0.85 | 1.11 |
| ![Pigtails](https://opengame.io/api/avatars/pigtails.classic.tangerine/portrait?size=64&theme=light&v=1) | `pigtails` |  | yes | dark | 1.03 | 0.92 |
| ![Box braids](https://opengame.io/api/avatars/boxbraids.classic.tangerine/portrait?size=64&theme=light&v=1) | `boxbraids` | Box braids | yes | dark | 0.97 | 1.03 |
| ![Half up](https://opengame.io/api/avatars/halfup.classic.tangerine/portrait?size=64&theme=light&v=1) | `halfup` | Half up | yes | brown | 0.94 | 1.15 |
| ![Textured crop](https://opengame.io/api/avatars/texturedcrop.classic.tangerine/portrait?size=64&theme=light&v=1) | `texturedcrop` | Textured crop | yes | brown | 0.85 | 0.99 |
| ![Tapered crop](https://opengame.io/api/avatars/taperedcrop.classic.tangerine/portrait?size=64&theme=light&v=1) | `taperedcrop` | Tapered crop | yes | brown | 0.85 | 0.96 |
| ![Soft quiff](https://opengame.io/api/avatars/softquiff.classic.tangerine/portrait?size=64&theme=light&v=1) | `softquiff` | Soft quiff | yes | brown | 0.85 | 1.09 |
| ![Curly crop](https://opengame.io/api/avatars/curlycrop.classic.tangerine/portrait?size=64&theme=light&v=1) | `curlycrop` | Curly crop | yes | dark | 0.85 | 0.97 |
| ![Soft bob](https://opengame.io/api/avatars/softbob.classic.tangerine/portrait?size=64&theme=light&v=1) | `softbob` | Soft bob | yes | brown | 0.92 | 0.84 |
| ![Round bob](https://opengame.io/api/avatars/roundbob.classic.tangerine/portrait?size=64&theme=light&v=1) | `roundbob` | Round bob | yes | brown | 0.81 | 0.84 |
<!-- /avatar-spec:shapes -->

<!-- avatar-spec:shape-eyes -->
| Id | Middle, right | Bottom, up | Eyes up | Eyes, right | Eye scale |
| --- | --- | --- | --- | --- | --- |
| `circle` | 0.00 | 0.00 | 0.50 | 0.00 | 1.00 |
| `square` | 0.00 | 0.04 | 0.50 | 0.00 | 1.00 |
| `slab` | 0.00 | 0.07 | 0.53 | 0.00 | 0.96 |
| `tall` | 0.00 | 0.00 | 0.56 | 0.00 | 0.90 |
| `egg` | 0.00 | -0.01 | 0.46 | 0.00 | 0.94 |
| `pebble` | 0.00 | 0.00 | 0.50 | 0.00 | 0.90 |
| `bean` | 0.00 | 0.05 | 0.52 | -0.02 | 0.96 |
| `drop` | 0.00 | -0.01 | 0.37 | 0.00 | 0.90 |
| `ghost` | 0.00 | 0.02 | 0.55 | 0.00 | 0.96 |
| `puff` | 0.00 | 0.01 | 0.48 | 0.00 | 0.94 |
| `flower` | 0.00 | 0.03 | 0.46 | 0.00 | 0.86 |
| `star` | 0.00 | 0.04 | 0.44 | 0.00 | 0.78 |
| `heart` | 0.00 | 0.01 | 0.51 | 0.00 | 0.84 |
| `diamond` | 0.00 | -0.09 | 0.49 | 0.00 | 0.80 |
| `hexagon` | 0.00 | 0.00 | 0.50 | 0.00 | 0.94 |
| `cat` | 0.00 | -0.01 | 0.40 | 0.00 | 0.94 |
| `bear` | 0.00 | 0.00 | 0.43 | 0.00 | 0.94 |
| `sprout` | 0.00 | -0.01 | 0.37 | 0.00 | 0.92 |
| `bunny` | 0.00 | -0.02 | 0.35 | 0.00 | 0.86 |
| `devil` | 0.00 | -0.01 | 0.42 | 0.00 | 0.94 |
| `alien` | 0.00 | -0.01 | 0.37 | 0.00 | 0.94 |
| `mushroom` | 0.00 | -0.01 | 0.26 | 0.00 | 0.70 |
| `onigiri` | 0.00 | 0.03 | 0.31 | 0.00 | 0.78 |
| `slime` | 0.00 | -0.02 | 0.53 | 0.00 | 0.94 |
| `pear` | 0.00 | -0.04 | 0.38 | 0.00 | 0.80 |
| `spiky` | 0.00 | 0.02 | 0.49 | 0.00 | 0.86 |
| `pill` | 0.00 | -0.01 | 0.55 | 0.00 | 0.84 |
| `dome` | 0.00 | 0.02 | 0.41 | 0.00 | 0.96 |
| `blob` | 0.03 | 0.03 | 0.50 | 0.00 | 0.94 |
| `moon` | -0.02 | -0.01 | 0.43 | -0.20 | 0.62 |
| `octagon` | 0.00 | 0.05 | 0.50 | 0.00 | 0.98 |
| `gem` | 0.00 | -0.04 | 0.67 | 0.00 | 0.86 |
| `shield` | 0.00 | -0.02 | 0.60 | 0.00 | 0.92 |
| `lemon` | 0.00 | 0.05 | 0.51 | 0.00 | 0.86 |
| `apple` | 0.00 | 0.05 | 0.34 | 0.00 | 0.94 |
| `pumpkin` | 0.00 | 0.02 | 0.38 | 0.00 | 0.90 |
| `acorn` | 0.00 | -0.04 | 0.35 | 0.00 | 0.78 |
| `cactus` | 0.00 | -0.01 | 0.66 | 0.00 | 0.64 |
| `flame` | 0.00 | -0.02 | 0.30 | 0.00 | 0.74 |
| `snowman` | 0.00 | -0.02 | 0.74 | 0.00 | 0.70 |
| `dumpling` | 0.00 | 0.03 | 0.34 | 0.00 | 0.86 |
| `bell` | 0.00 | -0.13 | 0.51 | 0.00 | 0.84 |
| `ufo` | 0.00 | 0.20 | 0.60 | 0.00 | 0.66 |
| `robot` | 0.00 | 0.06 | 0.38 | 0.00 | 0.96 |
| `crown` | 0.00 | -0.02 | 0.33 | 0.00 | 0.86 |
| `unicorn` | 0.00 | -0.02 | 0.38 | 0.00 | 0.94 |
| `fox` | 0.00 | 0.07 | 0.33 | 0.00 | 0.88 |
| `mouse` | 0.00 | 0.00 | 0.37 | 0.00 | 0.86 |
| `frog` | 0.00 | -0.01 | 0.75 | 0.00 | 0.86 |
| `chick` | 0.00 | -0.01 | 0.43 | 0.00 | 0.94 |
| `octopus` | 0.00 | -0.04 | 0.60 | 0.00 | 0.92 |
| `jellyfish` | 0.00 | 0.02 | 0.63 | 0.00 | 0.90 |
| `pentagon` | 0.00 | 0.01 | 0.46 | 0.00 | 0.92 |
| `plus` | 0.00 | -0.01 | 0.47 | 0.00 | 0.86 |
| `peanut` | 0.00 | 0.01 | 0.49 | 0.00 | 0.78 |
| `leaf` | -0.02 | -0.02 | 0.51 | 0.00 | 0.80 |
| `shell` | 0.00 | -0.04 | 0.56 | 0.00 | 0.80 |
| `tulip` | 0.00 | -0.04 | 0.45 | 0.00 | 0.82 |
| `penguin` | 0.00 | -0.01 | 0.62 | 0.00 | 0.84 |
| `owl` | 0.00 | -0.03 | 0.50 | 0.00 | 0.94 |
| `pig` | 0.06 | -0.01 | 0.54 | 0.00 | 0.88 |
| `koala` | 0.00 | 0.00 | 0.44 | 0.00 | 0.84 |
| `hamster` | 0.00 | -0.01 | 0.53 | 0.00 | 0.82 |
| `puppy` | 0.00 | 0.00 | 0.48 | 0.00 | 0.86 |
| `bat` | 0.00 | 0.00 | 0.37 | 0.00 | 0.84 |
| `hedgehog` | 0.00 | 0.00 | 0.31 | 0.00 | 0.84 |
| `axolotl` | 0.00 | 0.00 | 0.36 | 0.00 | 0.82 |
| `hatch` | 0.00 | -0.01 | 0.61 | 0.00 | 0.76 |
| `bee` | 0.00 | -0.01 | 0.33 | 0.00 | 0.84 |
| `snail` | 0.01 | 0.00 | 0.51 | 0.08 | 0.80 |
| `turtle` | 0.04 | -0.01 | 0.52 | 0.00 | 0.74 |
| `crab` | 0.00 | -0.01 | 0.30 | 0.00 | 0.74 |
| `fish` | 0.06 | 0.02 | 0.39 | -0.13 | 0.76 |
| `whale` | 0.04 | -0.01 | 0.32 | -0.12 | 0.78 |
| `shark` | 0.03 | -0.03 | 0.34 | -0.08 | 0.78 |
| `strawberry` | 0.00 | -0.01 | 0.45 | 0.00 | 0.86 |
| `pineapple` | 0.00 | -0.01 | 0.29 | 0.00 | 0.82 |
| `cupcake` | 0.00 | 0.00 | 0.41 | 0.00 | 0.82 |
| `icecream` | 0.00 | -0.02 | 0.62 | 0.00 | 0.84 |
| `pudding` | 0.00 | -0.01 | 0.51 | 0.00 | 0.86 |
| `toast` | 0.00 | 0.00 | 0.44 | 0.00 | 0.90 |
| `burger` | 0.00 | 0.00 | 0.64 | 0.00 | 0.78 |
| `bowl` | 0.00 | -0.01 | 0.40 | 0.00 | 0.80 |
| `mitten` | -0.06 | 0.00 | 0.56 | 0.06 | 0.84 |
| `tooth` | 0.00 | -0.01 | 0.61 | 0.00 | 0.86 |
| `candle` | 0.01 | -0.01 | 0.37 | 0.00 | 0.76 |
| `bulb` | 0.00 | 0.01 | 0.58 | 0.00 | 0.86 |
| `mug` | 0.02 | 0.00 | 0.50 | -0.08 | 0.90 |
| `potion` | 0.00 | -0.01 | 0.32 | 0.00 | 0.84 |
| `balloon` | 0.00 | -0.33 | 0.66 | 0.00 | 0.90 |
| `present` | 0.00 | -0.01 | 0.29 | 0.00 | 0.84 |
| `padlock` | 0.00 | -0.01 | 0.29 | 0.00 | 0.86 |
| `house` | 0.00 | -0.01 | 0.26 | 0.00 | 0.82 |
| `tv` | 0.00 | -0.01 | 0.40 | 0.00 | 0.92 |
| `gamepad` | 0.00 | 0.02 | 0.48 | 0.00 | 0.78 |
| `trophy` | 0.00 | -0.01 | 0.74 | 0.00 | 0.76 |
| `chest` | 0.00 | -0.01 | 0.26 | 0.00 | 0.80 |
| `bomb` | 0.00 | -0.01 | 0.37 | 0.00 | 0.90 |
| `pawn` | 0.00 | -0.13 | 0.74 | 0.00 | 0.64 |
| `spade` | 0.00 | -0.01 | 0.50 | 0.00 | 0.80 |
| `club` | 0.00 | -0.01 | 0.50 | 0.00 | 0.76 |
| `wizard` | 0.00 | -0.01 | 0.30 | 0.00 | 0.82 |
| `rocket` | 0.00 | -0.01 | 0.55 | 0.00 | 0.74 |
| `planet` | 0.00 | 0.00 | 0.51 | 0.00 | 0.82 |
| `panda` | 0.00 | 0.00 | 0.45 | 0.00 | 0.92 |
| `ladybug` | 0.00 | -0.01 | 0.41 | 0.00 | 0.88 |
| `elephant` | 0.00 | 0.00 | 0.57 | 0.00 | 0.84 |
| `lion` | 0.00 | 0.00 | 0.48 | 0.00 | 0.88 |
| `sheep` | 0.00 | 0.00 | 0.53 | 0.05 | 0.78 |
| `cow` | 0.00 | -0.01 | 0.44 | 0.00 | 0.84 |
| `duck` | -0.01 | -0.01 | 0.53 | -0.12 | 0.76 |
| `seal` | 0.05 | -0.01 | 0.33 | 0.06 | 0.72 |
| `dragon` | 0.00 | 0.02 | 0.38 | 0.00 | 0.90 |
| `dino` | 0.02 | -0.01 | 0.30 | 0.10 | 0.74 |
| `deer` | 0.00 | 0.00 | 0.41 | 0.00 | 0.80 |
| `giraffe` | 0.00 | -0.01 | 0.45 | 0.00 | 0.80 |
| `monkey` | 0.00 | 0.00 | 0.41 | 0.00 | 0.86 |
| `mole` | 0.00 | -0.01 | 0.58 | 0.00 | 0.84 |
| `squid` | 0.00 | 0.00 | 0.42 | 0.00 | 0.76 |
| `ray` | 0.00 | -0.03 | 0.55 | 0.00 | 0.80 |
| `butterfly` | 0.00 | 0.01 | 0.52 | 0.00 | 0.76 |
| `spider` | 0.00 | -0.02 | 0.36 | 0.00 | 0.84 |
| `caterpillar` | 0.01 | 0.01 | 0.44 | -0.24 | 0.70 |
| `yeti` | 0.00 | 0.00 | 0.43 | 0.00 | 0.90 |
| `goose` | 0.01 | -0.01 | 0.25 | 0.07 | 0.72 |
| `toucan` | -0.05 | 0.00 | 0.50 | 0.12 | 0.84 |
| `parrot` | -0.02 | -0.03 | 0.40 | 0.02 | 0.82 |
| `rhino` | -0.04 | -0.01 | 0.46 | 0.00 | 0.76 |
| `hippo` | 0.00 | 0.00 | 0.57 | 0.00 | 0.80 |
| `llama` | 0.00 | -0.01 | 0.52 | 0.00 | 0.80 |
| `camel` | -0.06 | -0.01 | 0.38 | 0.01 | 0.66 |
| `ram` | 0.00 | 0.00 | 0.48 | 0.00 | 0.82 |
| `walrus` | 0.00 | 0.00 | 0.56 | 0.00 | 0.88 |
| `hen` | 0.01 | -0.01 | 0.43 | 0.00 | 0.86 |
| `squirrel` | 0.06 | -0.01 | 0.36 | -0.08 | 0.72 |
| `golem` | 0.00 | -0.01 | 0.45 | 0.00 | 0.86 |
| `cherry` | 0.04 | -0.01 | 0.28 | -0.10 | 0.72 |
| `banana` | 0.03 | 0.00 | 0.20 | 0.00 | 0.74 |
| `carrot` | 0.00 | 0.00 | 0.46 | 0.00 | 0.80 |
| `eggplant` | 0.01 | -0.01 | 0.31 | 0.02 | 0.84 |
| `corn` | 0.00 | 0.02 | 0.48 | 0.00 | 0.76 |
| `cookie` | 0.00 | -0.01 | 0.47 | -0.02 | 0.92 |
| `macaron` | 0.00 | -0.01 | 0.50 | 0.00 | 0.88 |
| `popsicle` | 0.00 | 0.00 | 0.58 | 0.00 | 0.86 |
| `cake` | -0.01 | -0.02 | 0.24 | -0.02 | 0.76 |
| `croissant` | 0.00 | -0.01 | 0.46 | 0.00 | 0.74 |
| `boba` | 0.00 | -0.01 | 0.30 | 0.00 | 0.82 |
| `pizza` | 0.00 | -0.01 | 0.64 | 0.00 | 0.74 |
| `chili` | 0.03 | 0.01 | 0.41 | -0.10 | 0.78 |
| `grapes` | 0.00 | -0.01 | 0.47 | 0.00 | 0.80 |
| `radish` | 0.00 | -0.02 | 0.37 | 0.00 | 0.86 |
| `popcorn` | 0.01 | -0.01 | 0.30 | 0.00 | 0.80 |
| `fries` | 0.00 | -0.01 | 0.27 | 0.00 | 0.82 |
| `hotdog` | 0.00 | 0.02 | 0.49 | 0.00 | 0.86 |
| `candy` | 0.00 | 0.00 | 0.48 | 0.00 | 0.80 |
| `teapot` | -0.03 | 0.00 | 0.38 | 0.00 | 0.88 |
| `cauldron` | 0.00 | -0.02 | 0.38 | 0.00 | 0.90 |
| `bottle` | 0.00 | 0.00 | 0.30 | 0.00 | 0.82 |
| `jar` | 0.00 | 0.00 | 0.40 | 0.00 | 0.94 |
| `hourglass` | 0.00 | -0.02 | 0.67 | 0.00 | 0.72 |
| `lantern` | 0.00 | 0.00 | 0.37 | 0.00 | 0.84 |
| `umbrella` | 0.00 | -0.02 | 0.64 | 0.00 | 0.84 |
| `plant` | 0.00 | -0.01 | 0.26 | 0.00 | 0.80 |
| `globe` | 0.00 | -0.01 | 0.56 | 0.00 | 0.88 |
| `mailbox` | 0.07 | -0.01 | 0.63 | 0.00 | 0.86 |
| `cone` | 0.00 | -0.01 | 0.33 | 0.00 | 0.74 |
| `hydrant` | 0.00 | 0.00 | 0.39 | 0.00 | 0.80 |
| `rain` | 0.00 | 0.00 | 0.56 | 0.00 | 0.84 |
| `sun` | 0.00 | -0.03 | 0.47 | 0.00 | 0.86 |
| `crystal` | 0.00 | -0.01 | 0.25 | 0.00 | 0.76 |
| `tree` | 0.00 | -0.01 | 0.55 | 0.00 | 0.86 |
| `pine` | 0.00 | -0.01 | 0.26 | 0.00 | 0.70 |
| `volcano` | 0.00 | -0.01 | 0.26 | 0.00 | 0.82 |
| `comet` | 0.08 | -0.01 | 0.29 | -0.10 | 0.80 |
| `knight` | 0.00 | -0.01 | 0.45 | 0.00 | 0.90 |
| `ninja` | 0.09 | 0.00 | 0.48 | 0.00 | 0.92 |
| `tower` | 0.00 | 0.00 | 0.38 | 0.00 | 0.90 |
| `lighthouse` | 0.00 | -0.01 | 0.24 | 0.00 | 0.74 |
| `windmill` | 0.00 | -0.01 | 0.22 | 0.00 | 0.76 |
| `camera` | 0.00 | 0.00 | 0.41 | 0.00 | 0.86 |
| `joystick` | 0.00 | -0.01 | 0.21 | 0.00 | 0.74 |
| `arcade` | 0.00 | -0.01 | 0.51 | 0.00 | 0.80 |
| `medal` | 0.00 | -0.01 | 0.30 | 0.00 | 0.86 |
| `satellite` | 0.00 | 0.00 | 0.29 | 0.00 | 0.76 |
| `tornado` | 0.00 | -0.01 | 0.68 | 0.00 | 0.76 |
| `stump` | 0.00 | 0.00 | 0.34 | 0.00 | 0.86 |
| `lamp` | 0.00 | -0.01 | 0.72 | 0.00 | 0.74 |
| `alarm` | 0.00 | -0.02 | 0.45 | 0.00 | 0.88 |
| `hotair` | 0.00 | -0.01 | 0.58 | 0.00 | 0.90 |
| `car` | 0.00 | 0.00 | 0.60 | 0.01 | 0.80 |
| `boat` | 0.00 | -0.01 | 0.38 | -0.05 | 0.76 |
| `sub` | 0.02 | 0.00 | 0.28 | -0.07 | 0.76 |
| `bone` | 0.00 | -0.01 | 0.49 | 0.00 | 0.72 |
| `sock` | -0.03 | 0.00 | 0.57 | 0.12 | 0.86 |
| `tshirt` | 0.00 | 0.00 | 0.46 | 0.00 | 0.86 |
| `tophat` | 0.00 | 0.02 | 0.54 | 0.00 | 0.88 |
| `key` | 0.00 | -0.01 | 0.64 | 0.00 | 0.86 |
| `raccoon` | 0.00 | 0.00 | 0.39 | 0.00 | 0.90 |
| `tiger` | 0.00 | 0.00 | 0.46 | 0.00 | 0.92 |
| `koi` | 0.00 | -0.02 | 0.56 | 0.00 | 0.86 |
| `dalmatian` | 0.00 | 0.00 | 0.54 | 0.00 | 0.86 |
| `zebra` | 0.00 | -0.01 | 0.44 | 0.00 | 0.86 |
| `bust` | -0.01 | -0.02 | 0.58 | 0.00 | 0.98 |
| `moptop` | 0.00 | -0.01 | 0.33 | 0.00 | 0.90 |
| `spikecut` | 0.00 | -0.01 | 0.43 | 0.00 | 0.98 |
| `sidepart` | -0.01 | -0.04 | 0.38 | 0.00 | 0.94 |
| `pompadour` | 0.00 | -0.02 | 0.35 | 0.00 | 0.94 |
| `sculpt` | 0.02 | -0.02 | 0.68 | 0.05 | 0.70 |
| `pyramid` | 0.00 | 0.05 | 0.36 | 0.00 | 1.04 |
| `quiff` | 0.00 | 0.00 | 0.39 | 0.00 | 0.92 |
| `fullbeard` | 0.00 | -0.01 | 0.54 | 0.00 | 0.90 |
| `waves` | 0.00 | -0.01 | 0.48 | 0.00 | 0.86 |
| `tache` | 0.00 | -0.01 | 0.44 | 0.00 | 0.90 |
| `longhair` | 0.00 | -0.07 | 0.52 | 0.00 | 0.84 |
| `longwaves` | 0.00 | -0.07 | 0.50 | 0.00 | 0.84 |
| `deepwaves` | 0.00 | -0.08 | 0.53 | 0.00 | 0.82 |
| `shortfringe` | 0.00 | -0.02 | 0.38 | 0.00 | 0.90 |
| `shortcurls` | 0.00 | -0.02 | 0.30 | 0.00 | 0.74 |
| `layeredfringe` | 0.00 | -0.01 | 0.31 | 0.00 | 0.80 |
| `silkfringe` | 0.03 | -0.01 | 0.31 | -0.01 | 0.98 |
| `shortquiff` | 0.00 | -0.01 | 0.38 | 0.00 | 0.85 |
| `tousled` | 0.01 | 0.00 | 0.39 | 0.00 | 0.85 |
| `shavedbeard` | 0.00 | -0.01 | 0.55 | 0.00 | 0.88 |
| `buzzcut` | 0.00 | -0.01 | 0.44 | 0.00 | 0.88 |
| `crewcut` | 0.00 | -0.01 | 0.39 | 0.00 | 0.88 |
| `receding` | 0.00 | -0.01 | 0.42 | 0.00 | 0.88 |
| `slickback` | 0.00 | -0.01 | 0.36 | 0.00 | 0.88 |
| `fauxhawk` | 0.00 | -0.01 | 0.35 | 0.00 | 0.88 |
| `pixie` | 0.00 | -0.01 | 0.42 | 0.00 | 0.88 |
| `cornrows` | 0.00 | -0.01 | 0.43 | 0.00 | 0.88 |
| `curtains` | 0.00 | -0.01 | 0.39 | 0.00 | 0.88 |
| `afro` | 0.00 | -0.01 | 0.34 | 0.00 | 0.80 |
| `topknot` | 0.00 | -0.01 | 0.34 | 0.00 | 0.86 |
| `twinbuns` | 0.00 | -0.01 | 0.36 | 0.00 | 0.86 |
| `bob` | 0.00 | -0.01 | 0.40 | 0.00 | 0.84 |
| `lowpony` | 0.07 | -0.01 | 0.42 | 0.00 | 0.88 |
| `locs` | 0.00 | -0.05 | 0.43 | 0.00 | 0.82 |
| `sideswept` | -0.04 | -0.03 | 0.39 | 0.00 | 0.88 |
| `skinfade` | 0.00 | -0.01 | 0.39 | 0.00 | 0.88 |
| `undercut` | 0.00 | -0.01 | 0.35 | 0.00 | 0.88 |
| `frenchcrop` | 0.00 | -0.01 | 0.40 | 0.00 | 0.88 |
| `mohawk` | 0.00 | -0.01 | 0.35 | 0.00 | 0.88 |
| `lob` | 0.00 | -0.01 | 0.40 | 0.00 | 0.88 |
| `bluntbangs` | 0.00 | -0.01 | 0.40 | 0.00 | 0.88 |
| `curtainbangs` | 0.00 | -0.06 | 0.44 | 0.00 | 0.88 |
| `shag` | 0.00 | -0.01 | 0.42 | 0.00 | 0.88 |
| `longcurls` | 0.00 | -0.05 | 0.42 | 0.00 | 0.88 |
| `afropuff` | 0.00 | -0.01 | 0.36 | 0.00 | 0.88 |
| `highpony` | 0.03 | -0.01 | 0.36 | 0.00 | 0.88 |
| `highbun` | 0.00 | -0.01 | 0.36 | 0.00 | 0.88 |
| `messybun` | 0.00 | -0.01 | 0.35 | 0.00 | 0.88 |
| `pigtails` | 0.00 | -0.01 | 0.42 | 0.00 | 0.88 |
| `boxbraids` | 0.00 | -0.08 | 0.45 | 0.00 | 0.88 |
| `halfup` | 0.00 | -0.07 | 0.39 | 0.00 | 0.88 |
| `texturedcrop` | 0.00 | -0.01 | 0.39 | 0.00 | 0.88 |
| `taperedcrop` | 0.00 | -0.01 | 0.41 | 0.00 | 0.88 |
| `softquiff` | 0.00 | -0.01 | 0.36 | 0.00 | 0.88 |
| `curlycrop` | 0.00 | -0.01 | 0.40 | 0.00 | 0.88 |
| `softbob` | 0.00 | 0.11 | 0.43 | 0.00 | 0.84 |
| `roundbob` | 0.00 | 0.07 | 0.47 | 0.00 | 0.84 |
<!-- /avatar-spec:shape-eyes -->

### Eyes

The default eyes, `classic`, are two tall ovals with a smaller light inside each, leaning to the right. Measured on the default head at rest:

<!-- avatar-spec:eyes -->
| Measure | Share of the head height |
| --- | --- |
| Eye height, along its lean | 0.32 |
| Eye width, across its lean | 0.18 |
| Distance between the eye middles | 0.25 |
| Eye pair, left of the head's middle line (the resting glance) | 0.06 |
| Left eye middle, above the head's middle | 0.07 |
| Right eye middle, above the head's middle | 0.08 |
| Inner light height, along the lean | 0.18 |
| Inner light width, across the lean | 0.11 |
| Inner light, right of the eye's middle, across the lean | 0.03 |
| Inner light, below the eye's middle, along the lean | 0.06 |

Each eye leans 15 degrees, top toward the right. The inner light covers about 33% of a classic eye.
<!-- /avatar-spec:eyes -->

A style uses only the head's two eye colors, apart from `googly`, which is white plastic with a black bead whatever the head. `female` adds short lashes on the outer side of each eye and changes no other part. Do not read it as gender, pronouns or a voice. For a style your game does not have, draw `classic`.

<!-- avatar-spec:eye-styles -->
| Picture | Id | Label |
| --- | --- | --- |
| ![Classic](https://opengame.io/api/avatars/circle.classic.tangerine/portrait?size=64&theme=light&v=1) | `classic` |  |
| ![Sparkle](https://opengame.io/api/avatars/circle.sparkle.tangerine/portrait?size=64&theme=light&v=1) | `sparkle` |  |
| ![Wink](https://opengame.io/api/avatars/circle.wink.tangerine/portrait?size=64&theme=light&v=1) | `wink` |  |
| ![Happy](https://opengame.io/api/avatars/circle.happy.tangerine/portrait?size=64&theme=light&v=1) | `happy` |  |
| ![Calm](https://opengame.io/api/avatars/circle.calm.tangerine/portrait?size=64&theme=light&v=1) | `calm` |  |
| ![Angry](https://opengame.io/api/avatars/circle.angry.tangerine/portrait?size=64&theme=light&v=1) | `angry` |  |
| ![Sad](https://opengame.io/api/avatars/circle.sad.tangerine/portrait?size=64&theme=light&v=1) | `sad` |  |
| ![Sleepy](https://opengame.io/api/avatars/circle.sleepy.tangerine/portrait?size=64&theme=light&v=1) | `sleepy` |  |
| ![Squint](https://opengame.io/api/avatars/circle.squint.tangerine/portrait?size=64&theme=light&v=1) | `squint` |  |
| ![Wide](https://opengame.io/api/avatars/circle.wide.tangerine/portrait?size=64&theme=light&v=1) | `wide` |  |
| ![Dots](https://opengame.io/api/avatars/circle.dots.tangerine/portrait?size=64&theme=light&v=1) | `dots` |  |
| ![One eye](https://opengame.io/api/avatars/circle.cyclops.tangerine/portrait?size=64&theme=light&v=1) | `cyclops` | One eye |
| ![Hearts](https://opengame.io/api/avatars/circle.hearts.tangerine/portrait?size=64&theme=light&v=1) | `hearts` |  |
| ![Stars](https://opengame.io/api/avatars/circle.stars.tangerine/portrait?size=64&theme=light&v=1) | `stars` |  |
| ![Dazed](https://opengame.io/api/avatars/circle.dazed.tangerine/portrait?size=64&theme=light&v=1) | `dazed` |  |
| ![Glasses](https://opengame.io/api/avatars/circle.glasses.tangerine/portrait?size=64&theme=light&v=1) | `glasses` |  |
| ![Lashes](https://opengame.io/api/avatars/circle.lashes.tangerine/portrait?size=64&theme=light&v=1) | `lashes` |  |
| ![Googly](https://opengame.io/api/avatars/circle.googly.tangerine/portrait?size=64&theme=light&v=1) | `googly` |  |
| ![Dizzy](https://opengame.io/api/avatars/circle.dizzy.tangerine/portrait?size=64&theme=light&v=1) | `dizzy` |  |
| ![Crying](https://opengame.io/api/avatars/circle.crying.tangerine/portrait?size=64&theme=light&v=1) | `crying` |  |
| ![Excited](https://opengame.io/api/avatars/circle.excited.tangerine/portrait?size=64&theme=light&v=1) | `excited` |  |
| ![Side eye](https://opengame.io/api/avatars/circle.sideeye.tangerine/portrait?size=64&theme=light&v=1) | `sideeye` | Side eye |
| ![Visor](https://opengame.io/api/avatars/circle.visor.tangerine/portrait?size=64&theme=light&v=1) | `visor` |  |
| ![Square](https://opengame.io/api/avatars/circle.square.tangerine/portrait?size=64&theme=light&v=1) | `square` |  |
| ![Monocle](https://opengame.io/api/avatars/circle.monocle.tangerine/portrait?size=64&theme=light&v=1) | `monocle` |  |
| ![Anime](https://opengame.io/api/avatars/circle.anime.tangerine/portrait?size=64&theme=light&v=1) | `anime` |  |
| ![Pleading](https://opengame.io/api/avatars/circle.pleading.tangerine/portrait?size=64&theme=light&v=1) | `pleading` |  |
| ![Ovals](https://opengame.io/api/avatars/circle.ovals.tangerine/portrait?size=64&theme=light&v=1) | `ovals` |  |
| ![Mismatched](https://opengame.io/api/avatars/circle.mismatched.tangerine/portrait?size=64&theme=light&v=1) | `mismatched` |  |
| ![Brows](https://opengame.io/api/avatars/circle.brows.tangerine/portrait?size=64&theme=light&v=1) | `brows` |  |
| ![Worried](https://opengame.io/api/avatars/circle.worried.tangerine/portrait?size=64&theme=light&v=1) | `worried` |  |
| ![Raised brow](https://opengame.io/api/avatars/circle.raised.tangerine/portrait?size=64&theme=light&v=1) | `raised` | Raised brow |
| ![Furious](https://opengame.io/api/avatars/circle.furious.tangerine/portrait?size=64&theme=light&v=1) | `furious` |  |
| ![Shocked](https://opengame.io/api/avatars/circle.shocked.tangerine/portrait?size=64&theme=light&v=1) | `shocked` |  |
| ![Sly](https://opengame.io/api/avatars/circle.sly.tangerine/portrait?size=64&theme=light&v=1) | `sly` |  |
| ![Slit](https://opengame.io/api/avatars/circle.slit.tangerine/portrait?size=64&theme=light&v=1) | `slit` |  |
| ![Starstruck](https://opengame.io/api/avatars/circle.starstruck.tangerine/portrait?size=64&theme=light&v=1) | `starstruck` |  |
| ![Smitten](https://opengame.io/api/avatars/circle.smitten.tangerine/portrait?size=64&theme=light&v=1) | `smitten` |  |
| ![Diamond](https://opengame.io/api/avatars/circle.diamond.tangerine/portrait?size=64&theme=light&v=1) | `diamond` |  |
| ![Hollow](https://opengame.io/api/avatars/circle.hollow.tangerine/portrait?size=64&theme=light&v=1) | `hollow` |  |
| ![Plus](https://opengame.io/api/avatars/circle.plus.tangerine/portrait?size=64&theme=light&v=1) | `plus` |  |
| ![Twinkle](https://opengame.io/api/avatars/circle.twinkle.tangerine/portrait?size=64&theme=light&v=1) | `twinkle` |  |
| ![Target](https://opengame.io/api/avatars/circle.target.tangerine/portrait?size=64&theme=light&v=1) | `target` |  |
| ![Hypno](https://opengame.io/api/avatars/circle.hypno.tangerine/portrait?size=64&theme=light&v=1) | `hypno` |  |
| ![Button](https://opengame.io/api/avatars/circle.button.tangerine/portrait?size=64&theme=light&v=1) | `button` |  |
| ![Goggles](https://opengame.io/api/avatars/circle.goggles.tangerine/portrait?size=64&theme=light&v=1) | `goggles` |  |
| ![Shades](https://opengame.io/api/avatars/circle.shades.tangerine/portrait?size=64&theme=light&v=1) | `shades` |  |
| ![Pirate](https://opengame.io/api/avatars/circle.pirate.tangerine/portrait?size=64&theme=light&v=1) | `pirate` |  |
| ![Blush](https://opengame.io/api/avatars/circle.blush.tangerine/portrait?size=64&theme=light&v=1) | `blush` |  |
| ![Nervous](https://opengame.io/api/avatars/circle.nervous.tangerine/portrait?size=64&theme=light&v=1) | `nervous` |  |
| ![Cross-eyed](https://opengame.io/api/avatars/circle.crosseyed.tangerine/portrait?size=64&theme=light&v=1) | `crosseyed` | Cross-eyed |
| ![Daydream](https://opengame.io/api/avatars/circle.daydream.tangerine/portrait?size=64&theme=light&v=1) | `daydream` |  |
| ![Peeking](https://opengame.io/api/avatars/circle.peeking.tangerine/portrait?size=64&theme=light&v=1) | `peeking` |  |
| ![Ringed](https://opengame.io/api/avatars/circle.ringed.tangerine/portrait?size=64&theme=light&v=1) | `ringed` |  |
| ![Tired](https://opengame.io/api/avatars/circle.tired.tangerine/portrait?size=64&theme=light&v=1) | `tired` |  |
| ![Annoyed](https://opengame.io/api/avatars/circle.annoyed.tangerine/portrait?size=64&theme=light&v=1) | `annoyed` |  |
| ![Skeptical](https://opengame.io/api/avatars/circle.skeptic.tangerine/portrait?size=64&theme=light&v=1) | `skeptic` | Skeptical |
| ![Dreamy](https://opengame.io/api/avatars/circle.dreamy.tangerine/portrait?size=64&theme=light&v=1) | `dreamy` |  |
| ![Flirty](https://opengame.io/api/avatars/circle.flirty.tangerine/portrait?size=64&theme=light&v=1) | `flirty` |  |
| ![Demure](https://opengame.io/api/avatars/circle.demure.tangerine/portrait?size=64&theme=light&v=1) | `demure` |  |
| ![Snooze](https://opengame.io/api/avatars/circle.snooze.tangerine/portrait?size=64&theme=light&v=1) | `snooze` |  |
| ![Sobbing](https://opengame.io/api/avatars/circle.sobbing.tangerine/portrait?size=64&theme=light&v=1) | `sobbing` |  |
| ![Humming](https://opengame.io/api/avatars/circle.humming.tangerine/portrait?size=64&theme=light&v=1) | `humming` |  |
| ![Puzzled](https://opengame.io/api/avatars/circle.puzzled.tangerine/portrait?size=64&theme=light&v=1) | `puzzled` |  |
| ![Alert](https://opengame.io/api/avatars/circle.alert.tangerine/portrait?size=64&theme=light&v=1) | `alert` |  |
| ![Unibrow](https://opengame.io/api/avatars/circle.unibrow.tangerine/portrait?size=64&theme=light&v=1) | `unibrow` |  |
| ![Freckles](https://opengame.io/api/avatars/circle.freckles.tangerine/portrait?size=64&theme=light&v=1) | `freckles` |  |
| ![Whiskers](https://opengame.io/api/avatars/circle.whiskers.tangerine/portrait?size=64&theme=light&v=1) | `whiskers` |  |
| ![Glitter](https://opengame.io/api/avatars/circle.glitter.tangerine/portrait?size=64&theme=light&v=1) | `glitter` |  |
| ![Bow](https://opengame.io/api/avatars/circle.bow.tangerine/portrait?size=64&theme=light&v=1) | `bow` |  |
| ![Scar](https://opengame.io/api/avatars/circle.scar.tangerine/portrait?size=64&theme=light&v=1) | `scar` |  |
| ![Bandage](https://opengame.io/api/avatars/circle.bandage.tangerine/portrait?size=64&theme=light&v=1) | `bandage` |  |
| ![Cyborg](https://opengame.io/api/avatars/circle.cyborg.tangerine/portrait?size=64&theme=light&v=1) | `cyborg` |  |
| ![Three eyes](https://opengame.io/api/avatars/circle.triclops.tangerine/portrait?size=64&theme=light&v=1) | `triclops` | Three eyes |
| ![Four eyes](https://opengame.io/api/avatars/circle.quad.tangerine/portrait?size=64&theme=light&v=1) | `quad` | Four eyes |
| ![Aviators](https://opengame.io/api/avatars/circle.aviators.tangerine/portrait?size=64&theme=light&v=1) | `aviators` |  |
| ![Heart shades](https://opengame.io/api/avatars/circle.heartshades.tangerine/portrait?size=64&theme=light&v=1) | `heartshades` | Heart shades |
| ![Mask](https://opengame.io/api/avatars/circle.mask.tangerine/portrait?size=64&theme=light&v=1) | `mask` |  |
| ![Winged](https://opengame.io/api/avatars/circle.winged.tangerine/portrait?size=64&theme=light&v=1) | `winged` |  |
| ![Goat](https://opengame.io/api/avatars/circle.goat.tangerine/portrait?size=64&theme=light&v=1) | `goat` |  |
| ![Keyhole](https://opengame.io/api/avatars/circle.keyhole.tangerine/portrait?size=64&theme=light&v=1) | `keyhole` |  |
| ![Scanlines](https://opengame.io/api/avatars/circle.scanline.tangerine/portrait?size=64&theme=light&v=1) | `scanline` | Scanlines |
| ![Glowing](https://opengame.io/api/avatars/circle.glowing.tangerine/portrait?size=64&theme=light&v=1) | `glowing` |  |
| ![Blocks](https://opengame.io/api/avatars/circle.blocks.tangerine/portrait?size=64&theme=light&v=1) | `blocks` |  |
| ![Triangle](https://opengame.io/api/avatars/circle.triangle.tangerine/portrait?size=64&theme=light&v=1) | `triangle` |  |
| ![Hexagon](https://opengame.io/api/avatars/circle.hexagon.tangerine/portrait?size=64&theme=light&v=1) | `hexagon` |  |
| ![Deadpan](https://opengame.io/api/avatars/circle.deadpan.tangerine/portrait?size=64&theme=light&v=1) | `deadpan` |  |
| ![Disapproving](https://opengame.io/api/avatars/circle.disapprove.tangerine/portrait?size=64&theme=light&v=1) | `disapprove` | Disapproving |
| ![Wavy](https://opengame.io/api/avatars/circle.wavy.tangerine/portrait?size=64&theme=light&v=1) | `wavy` |  |
| ![Frazzled](https://opengame.io/api/avatars/circle.frazzled.tangerine/portrait?size=64&theme=light&v=1) | `frazzled` |  |
| ![Money](https://opengame.io/api/avatars/circle.money.tangerine/portrait?size=64&theme=light&v=1) | `money` |  |
| ![Lightning](https://opengame.io/api/avatars/circle.bolt.tangerine/portrait?size=64&theme=light&v=1) | `bolt` | Lightning |
| ![Fiery](https://opengame.io/api/avatars/circle.fiery.tangerine/portrait?size=64&theme=light&v=1) | `fiery` |  |
| ![Flowers](https://opengame.io/api/avatars/circle.flowers.tangerine/portrait?size=64&theme=light&v=1) | `flowers` |  |
| ![Moons](https://opengame.io/api/avatars/circle.moons.tangerine/portrait?size=64&theme=light&v=1) | `moons` |  |
| ![Sunny](https://opengame.io/api/avatars/circle.sunny.tangerine/portrait?size=64&theme=light&v=1) | `sunny` |  |
| ![Gears](https://opengame.io/api/avatars/circle.gears.tangerine/portrait?size=64&theme=light&v=1) | `gears` |  |
| ![Spades](https://opengame.io/api/avatars/circle.spades.tangerine/portrait?size=64&theme=light&v=1) | `spades` |  |
| ![Paws](https://opengame.io/api/avatars/circle.paws.tangerine/portrait?size=64&theme=light&v=1) | `paws` |  |
| ![Chomp](https://opengame.io/api/avatars/circle.chomp.tangerine/portrait?size=64&theme=light&v=1) | `chomp` |  |
| ![Heart outlines](https://opengame.io/api/avatars/circle.openhearts.tangerine/portrait?size=64&theme=light&v=1) | `openhearts` | Heart outlines |
| ![Pinpoint](https://opengame.io/api/avatars/circle.pinpoint.tangerine/portrait?size=64&theme=light&v=1) | `pinpoint` |  |
| ![Cross pupils](https://opengame.io/api/avatars/circle.crosspupil.tangerine/portrait?size=64&theme=light&v=1) | `crosspupil` | Cross pupils |
| ![Bloodshot](https://opengame.io/api/avatars/circle.bloodshot.tangerine/portrait?size=64&theme=light&v=1) | `bloodshot` |  |
| ![Doll](https://opengame.io/api/avatars/circle.doll.tangerine/portrait?size=64&theme=light&v=1) | `doll` |  |
| ![Wall-eyed](https://opengame.io/api/avatars/circle.walleyed.tangerine/portrait?size=64&theme=light&v=1) | `walleyed` | Wall-eyed |
| ![Starry wink](https://opengame.io/api/avatars/circle.starwink.tangerine/portrait?size=64&theme=light&v=1) | `starwink` | Starry wink |
| ![Determined](https://opengame.io/api/avatars/circle.determined.tangerine/portrait?size=64&theme=light&v=1) | `determined` |  |
| ![Smug](https://opengame.io/api/avatars/circle.smug.tangerine/portrait?size=64&theme=light&v=1) | `smug` |  |
| ![Woozy](https://opengame.io/api/avatars/circle.woozy.tangerine/portrait?size=64&theme=light&v=1) | `woozy` |  |
| ![Flustered](https://opengame.io/api/avatars/circle.flustered.tangerine/portrait?size=64&theme=light&v=1) | `flustered` |  |
| ![Tears of joy](https://opengame.io/api/avatars/circle.joyful.tangerine/portrait?size=64&theme=light&v=1) | `joyful` | Tears of joy |
| ![Sweating](https://opengame.io/api/avatars/circle.sweaty.tangerine/portrait?size=64&theme=light&v=1) | `sweaty` | Sweating |
| ![Crush](https://opengame.io/api/avatars/circle.crush.tangerine/portrait?size=64&theme=light&v=1) | `crush` |  |
| ![Idea](https://opengame.io/api/avatars/circle.idea.tangerine/portrait?size=64&theme=light&v=1) | `idea` |  |
| ![Clown](https://opengame.io/api/avatars/circle.clown.tangerine/portrait?size=64&theme=light&v=1) | `clown` |  |
| ![War paint](https://opengame.io/api/avatars/circle.warpaint.tangerine/portrait?size=64&theme=light&v=1) | `warpaint` | War paint |
| ![Stitched](https://opengame.io/api/avatars/circle.stitched.tangerine/portrait?size=64&theme=light&v=1) | `stitched` |  |
| ![Speechless](https://opengame.io/api/avatars/circle.ellipsis.tangerine/portrait?size=64&theme=light&v=1) | `ellipsis` | Speechless |
| ![Question marks](https://opengame.io/api/avatars/circle.questions.tangerine/portrait?size=64&theme=light&v=1) | `questions` | Question marks |
| ![Exclamation](https://opengame.io/api/avatars/circle.exclaim.tangerine/portrait?size=64&theme=light&v=1) | `exclaim` | Exclamation |
| ![Notes](https://opengame.io/api/avatars/circle.notes.tangerine/portrait?size=64&theme=light&v=1) | `notes` |  |
| ![Clubs](https://opengame.io/api/avatars/circle.clubs.tangerine/portrait?size=64&theme=light&v=1) | `clubs` |  |
| ![Shields](https://opengame.io/api/avatars/circle.shields.tangerine/portrait?size=64&theme=light&v=1) | `shields` |  |
| ![Checks](https://opengame.io/api/avatars/circle.checks.tangerine/portrait?size=64&theme=light&v=1) | `checks` |  |
| ![Hourglass](https://opengame.io/api/avatars/circle.hourglass.tangerine/portrait?size=64&theme=light&v=1) | `hourglass` |  |
| ![D-shape](https://opengame.io/api/avatars/circle.dshape.tangerine/portrait?size=64&theme=light&v=1) | `dshape` | D-shape |
| ![Teardrop](https://opengame.io/api/avatars/circle.teardrop.tangerine/portrait?size=64&theme=light&v=1) | `teardrop` |  |
| ![Droopy](https://opengame.io/api/avatars/circle.droopy.tangerine/portrait?size=64&theme=light&v=1) | `droopy` |  |
| ![Cat’s eye](https://opengame.io/api/avatars/circle.catseye.tangerine/portrait?size=64&theme=light&v=1) | `catseye` | Cat’s eye |
| ![Squircle](https://opengame.io/api/avatars/circle.squircle.tangerine/portrait?size=64&theme=light&v=1) | `squircle` |  |
| ![Owl](https://opengame.io/api/avatars/circle.owl.tangerine/portrait?size=64&theme=light&v=1) | `owl` |  |
| ![Bug eyes](https://opengame.io/api/avatars/circle.bug.tangerine/portrait?size=64&theme=light&v=1) | `bug` | Bug eyes |
| ![Spider](https://opengame.io/api/avatars/circle.spider.tangerine/portrait?size=64&theme=light&v=1) | `spider` |  |
| ![Outlined](https://opengame.io/api/avatars/circle.outline.tangerine/portrait?size=64&theme=light&v=1) | `outline` | Outlined |
| ![Wide-set](https://opengame.io/api/avatars/circle.wideset.tangerine/portrait?size=64&theme=light&v=1) | `wideset` | Wide-set |
| ![Close-set](https://opengame.io/api/avatars/circle.closeset.tangerine/portrait?size=64&theme=light&v=1) | `closeset` | Close-set |
| ![LED](https://opengame.io/api/avatars/circle.led.tangerine/portrait?size=64&theme=light&v=1) | `led` | LED |
| ![Scanner](https://opengame.io/api/avatars/circle.scanner.tangerine/portrait?size=64&theme=light&v=1) | `scanner` |  |
| ![Reticle](https://opengame.io/api/avatars/circle.reticle.tangerine/portrait?size=64&theme=light&v=1) | `reticle` |  |
| ![VR headset](https://opengame.io/api/avatars/circle.vr.tangerine/portrait?size=64&theme=light&v=1) | `vr` | VR headset |
| ![3D glasses](https://opengame.io/api/avatars/circle.threed.tangerine/portrait?size=64&theme=light&v=1) | `threed` | 3D glasses |
| ![Ski goggles](https://opengame.io/api/avatars/circle.ski.tangerine/portrait?size=64&theme=light&v=1) | `ski` | Ski goggles |
| ![Sleep mask](https://opengame.io/api/avatars/circle.sleepmask.tangerine/portrait?size=64&theme=light&v=1) | `sleepmask` | Sleep mask |
| ![Star glasses](https://opengame.io/api/avatars/circle.starglasses.tangerine/portrait?size=64&theme=light&v=1) | `starglasses` | Star glasses |
| ![Magnifier](https://opengame.io/api/avatars/circle.magnify.tangerine/portrait?size=64&theme=light&v=1) | `magnify` | Magnifier |
| ![Cat-eye glasses](https://opengame.io/api/avatars/circle.catglasses.tangerine/portrait?size=64&theme=light&v=1) | `catglasses` | Cat-eye glasses |
| ![Reading glasses](https://opengame.io/api/avatars/circle.readers.tangerine/portrait?size=64&theme=light&v=1) | `readers` | Reading glasses |
| ![Disguise](https://opengame.io/api/avatars/circle.disguise.tangerine/portrait?size=64&theme=light&v=1) | `disguise` |  |
| ![Pause](https://opengame.io/api/avatars/circle.pause.tangerine/portrait?size=64&theme=light&v=1) | `pause` |  |
| ![Equalizer](https://opengame.io/api/avatars/circle.equalizer.tangerine/portrait?size=64&theme=light&v=1) | `equalizer` |  |
| ![Prompt](https://opengame.io/api/avatars/circle.prompt.tangerine/portrait?size=64&theme=light&v=1) | `prompt` |  |
| ![Cursors](https://opengame.io/api/avatars/circle.cursor.tangerine/portrait?size=64&theme=light&v=1) | `cursor` | Cursors |
| ![Laser](https://opengame.io/api/avatars/circle.laser.tangerine/portrait?size=64&theme=light&v=1) | `laser` |  |
| ![Power](https://opengame.io/api/avatars/circle.power.tangerine/portrait?size=64&theme=light&v=1) | `power` |  |
| ![Snowflakes](https://opengame.io/api/avatars/circle.snowflake.tangerine/portrait?size=64&theme=light&v=1) | `snowflake` | Snowflakes |
| ![Crinkled](https://opengame.io/api/avatars/circle.crinkled.tangerine/portrait?size=64&theme=light&v=1) | `crinkled` |  |
| ![Dice](https://opengame.io/api/avatars/circle.dice.tangerine/portrait?size=64&theme=light&v=1) | `dice` |  |
| ![Saucer eyes](https://opengame.io/api/avatars/circle.saucers.tangerine/portrait?size=64&theme=light&v=1) | `saucers` | Saucer eyes |
| ![Glasses and eyes](https://opengame.io/api/avatars/circle.specs.tangerine/portrait?size=64&theme=light&v=1) | `specs` | Glasses and eyes |
| ![Round glasses](https://opengame.io/api/avatars/circle.roundspecs.tangerine/portrait?size=64&theme=light&v=1) | `roundspecs` | Round glasses |
<!-- /avatar-spec:eye-styles -->

### Head accessories

An accessory rests on top of the head or hangs beside it, under the eyes, which are drawn over it. A color named from the head palette uses that entry's hex and finish, in the inks for the background. Skip an accessory your game does not have.

An accessory is placed in head units around its shape's anchor, from the "Anchors" table below. Across, `u` is the distance right of the anchor's x; down, `v` is the distance below its seat; both are counted in the anchor's scale, so a point is at x = Hat x + u × Scale and y = Seat + v × Scale in portrait units. On the round head, each accessory spans the `u` and `v` ranges in the table, so a negative "v from" is how far it rises above the seat.

Each accessory is a list of parts, each in the main color, the trim color or the head's eye color. Where two parts overlap, the one listed first wins, and the drawings in `ACCESSORIES` already show the winner. A part that goes behind the head shows only where the head is not, such as the band of a pair of headphones or the back of a space helmet; "Behind" marks an accessory with one, and each drawing comes in two versions, one for cells over the head and one for cells off it. A flat part is one tone with no shading and no edge. Every other part is shaded in five tones like a head of its color, with an edge band of its own.

"Refit" marks an accessory whose parts follow the shape's width, ear line or side as well as its scale, such as a brim sized to the head or ear pieces on the ear line. The drawings are the round head's. On another shape, OpenGame resizes those parts to fit, so the round head's drawing placed by the anchor and scale is close but not exact; compare it with that shape's portrait.

<!-- avatar-spec:accessories -->
| Id | Label | Main color | Trim color | u from | u to | v from | v to | Behind | Refit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crown` | Crown | `gold` (head palette) | #E8423A | -0.50 | 0.50 | -0.36 | -0.01 |  | yes |
| `cap` | Cap | #E8423A | #F4F3EF | -0.90 | 0.58 | -0.41 | 0.02 |  | yes |
| `beanie` | Beanie | #1FB5B0 | #F3E7C9 | -0.60 | 0.60 | -0.53 | 0.02 |  | yes |
| `halo` | Halo | #FFD45C |  | -0.62 | 0.63 | -0.51 | -0.16 |  |  |
| `headphones` | Headphones | #2B2B30 | #E8423A | -0.92 | 0.93 | -0.26 | 0.77 | yes | yes |
| `tophat` | Top hat | #4A4A54 | #E8423A | -0.60 | 0.60 | -0.51 | 0.04 |  | yes |
| `bowler` | Bowler hat | #57504A | #2E2A28 | -0.62 | 0.63 | -0.43 | 0.02 |  | yes |
| `fedora` | Fedora | #7A7068 | #2B2B30 | -0.67 | 0.68 | -0.43 | 0.02 |  | yes |
| `cowboy` | Cowboy hat | #B07A45 | #5A3A22 | -0.75 | 0.75 | -0.46 | 0.02 |  | yes |
| `sombrero` | Sombrero | #E3B85A | #D7263D | -0.97 | 0.98 | -0.48 | 0.04 |  | yes |
| `boater` | Boater | #E3C27A | #2F5DA8 | -0.67 | 0.68 | -0.33 | 0.04 |  | yes |
| `bucket` | Bucket hat | #4F6D8F | #2F4560 | -0.70 | 0.70 | -0.38 | 0.09 |  | yes |
| `safari` | Pith helmet | #D8C79B | #8C7E58 | -0.70 | 0.70 | -0.51 | 0.04 |  | yes |
| `witch` | Witch hat | #4B3966 | #8E5BD9 | -0.72 | 0.73 | -0.48 | -0.01 |  | yes |
| `wizardhat` | Wizard hat | #3550C8 | #FFD45C | -0.55 | 0.55 | -0.51 | 0.04 |  | yes |
| `party` | Party hat | #FF5FA2 | #FFD45C | -0.37 | 0.38 | -0.51 | 0.02 |  | yes |
| `chef` | Chef’s hat | #FAF9F6 |  | -0.42 | 0.43 | -0.51 | 0.02 |  | yes |
| `beret` | Beret | #D7263D |  | -0.65 | 0.50 | -0.36 | 0.02 |  | yes |
| `fez` | Fez | #C8102E | #FFC53D | -0.37 | 0.43 | -0.43 | 0.04 |  | yes |
| `captain` | Captain’s hat | #FAF9F6 | #1F2D4D | -0.60 | 0.60 | -0.43 | -0.03 |  | yes |
| `pirate` | Pirate hat | #403C48 | #F4F3EF | -0.62 | 0.63 | -0.48 | 0.02 |  | yes |
| `mortarboard` | Graduation cap | #40404A | #FFC53D | -0.50 | 0.53 | -0.43 | 0.02 |  | yes |
| `backcap` | Backwards cap | #1B6CA8 | #F4F3EF | -0.57 | 0.93 | -0.36 | -0.01 |  | yes |
| `propeller` | Propeller cap | #E8423A | #FFD45C | -0.57 | 0.58 | -0.48 | -0.01 |  | yes |
| `hardhat` | Hard hat | #FFC53D | #E39A12 | -0.65 | 0.65 | -0.41 | 0.02 |  | yes |
| `viking` | Viking helmet | `silver` (head palette) | #F1E4C3 | -0.65 | 0.65 | -0.48 | -0.03 |  | yes |
| `knight` | Knight’s helmet | `silver` (head palette) | #D7263D | -0.52 | 0.53 | -0.51 | -0.03 |  | yes |
| `aviator` | Aviator cap | #8A5A3C | #7FD3F7 | -0.57 | 0.58 | -0.33 | -0.01 |  | yes |
| `spacehelmet` | Space helmet | #9FD8FF | #FFFFFF | -1.02 | 1.03 | -0.46 | 0.59 | yes | yes |
| `santa` | Santa hat | #D7263D | #F7F6F2 | -0.60 | 0.85 | -0.43 | -0.01 |  | yes |
| `nightcap` | Nightcap | #4B6CD1 | #F4F3EF | -0.55 | 0.78 | -0.38 | 0.24 |  | yes |
| `jester` | Jester hat | #7B3FC4 | #FFC53D | -0.77 | 0.78 | -0.43 | 0.02 |  | yes |
| `ushanka` | Ushanka | #7A5638 | #E9DCC6 | -0.80 | 0.80 | -0.43 | 0.09 |  | yes |
| `bandana` | Bandana | #D7263D | #F4F3EF | -0.57 | 0.85 | -0.33 | 0.24 |  | yes |
| `toadstool` | Toadstool | #E8423A | #F7F6F2 | -0.65 | 0.65 | -0.48 | -0.03 |  | yes |
| `tiara` | Tiara | `silver` (head palette) | #F06AA8 | -0.47 | 0.48 | -0.43 | -0.03 |  | yes |
| `papercrown` | Paper crown | #FFE066 |  | -0.50 | 0.50 | -0.38 | 0.02 |  | yes |
| `laurel` | Laurel wreath | #4E9A3A | #7CC45A | -0.72 | 0.73 | -0.41 | 0.07 |  | yes |
| `flowercrown` | Flower crown | #4E9A3A | #FF8FB8 | -0.65 | 0.65 | -0.41 | -0.01 |  | yes |
| `bunnyears` | Bunny ears | #F4F3EF | #F59BB8 | -0.37 | 0.38 | -0.48 | -0.06 |  | yes |
| `catears` | Cat ears | #45454E | #F59BB8 | -0.47 | 0.48 | -0.41 | 0.04 |  | yes |
| `bearears` | Bear ears | #8A5A3C | #E2C79A | -0.50 | 0.50 | -0.36 | -0.06 |  | yes |
| `horns` | Devil horns | #E8423A |  | -0.47 | 0.48 | -0.46 | 0.09 |  | yes |
| `unihorn` | Unicorn horn | #F7D774 | #F59BB8 | -0.17 | 0.18 | -0.51 | 0.17 |  |  |
| `antlers` | Antlers | #9A6A44 |  | -0.50 | 0.50 | -0.48 | 0.09 |  |  |
| `antennae` | Antennae | #55555F | #FF5FA2 | -0.35 | 0.35 | -0.48 | 0.07 |  |  |
| `mohawk` | Mohawk | #FF3D9A |  | -0.32 | 0.33 | -0.48 | 0.02 |  |  |
| `bow` | Bow | #FF5FA2 | #D93D86 | -0.37 | 0.38 | -0.46 | 0.02 |  |  |
| `flower` | Flower | #FF7EB3 | #FFD45C | 0.18 | 0.55 | -0.46 | -0.11 |  | yes |
| `leaf` | Leaf | #E67E22 | #8A5A3C | -0.07 | 0.28 | -0.46 | 0.07 |  |  |
| `cherries` | Cherries | #D7263D | #4E9A3A | -0.27 | 0.30 | -0.48 | 0.04 |  |  |
| `bird` | Bird | #5CC8FF | #FFA53D | -0.32 | 0.35 | -0.41 | -0.03 |  |  |
| `cloud` | Cloud | #FFFFFF |  | -0.32 | 0.33 | -0.48 | -0.18 |  |  |
| `raincloud` | Rain cloud | #8D93A0 | #5CC8FF | -0.32 | 0.33 | -0.48 | -0.06 |  |  |
| `star` | Star | `gold` (head palette) |  | -0.22 | 0.23 | -0.51 | -0.08 |  |  |
| `heart` | Heart | #FF4D6D |  | -0.20 | 0.20 | -0.48 | -0.13 |  |  |
| `idea` | Bright idea | #FFE066 | #8C8E94 | -0.15 | 0.15 | -0.48 | -0.11 |  |  |
| `fire` | Fire | #FF7A2F | #FFD45C | -0.20 | 0.20 | -0.48 | 0.02 |  |  |
| `headset` | Headset | #45454E | #3DDC97 | -0.95 | 0.93 | -0.18 | 1.09 | yes | yes |
| `earmuffs` | Earmuffs | #F59BB8 | #C6C8CE | -1.00 | 1.00 | -0.16 | 0.77 | yes | yes |
| `wings` | Wings | #FFFFFF |  | -1.13 | 1.13 | 0.29 | 0.77 | yes | yes |
| `racingcap` | Racing cap | #1D1D20 | #3A3A40 | -0.60 | 0.60 | -0.41 | 0.07 |  | yes |
| `neonhalo` | Neon halo | `magenta` (head palette) |  | -0.62 | 0.63 | -0.51 | -0.16 |  |  |
| `crosspin` | Cross pin | #222228 |  | -0.50 | -0.10 | -0.18 | 0.24 |  | yes |
| `frontcap` | Cap, facing forward | #2A2A30 | #45454D | -0.65 | 0.65 | -0.41 | 0.37 |  | yes |
<!-- /avatar-spec:accessories -->

### Facial hair and hair color

Facial hair covers the lower face, under the eyes. It takes the facial hair color, then the hair color, then the color the hairstyle was made in. The hair color applies to the hair of a hairstyle outline.

Each style is drawn in face units: across, 1 is the jaw's edge on the mouth line; down, 0 is the eye line and 1 the chin, so one beard fits a round face, a long one and a cat. <!-- avatar-spec:mouth -->
The mouth line is 0.64 of the way from the eyes to the chin. Where a style covers the mouth line, the mouth shows through as a gap in the hair: a grin 0.60 of the jaw's half width across and 0.13 of the eye-to-chin height deep, flat along its top and round below.
<!-- /avatar-spec:mouth --> A moustache on its own sits just above the mouth line with a thin smile in the hair's color under it. Draw no other mouth.

<!-- avatar-spec:facial-place -->
On a shape, a point `(u, t)` is at x = Face x + u × Jaw and y = Eye line + t × (Chin − Eye line) in portrait units, from the "Anchors" table, with Chin − Eye line taken as at least 0.20.
<!-- /avatar-spec:facial-place --> `FACIAL_HAIR` holds each style drawn on the round head in these units. "Fills the jaw" marks a style that adds to the head's outline below the jaw, joined smoothly to it, so the beard shows past the chin; the drawing marks that added outline separately from the hair. "Mix" marks a soft style, whose tones are only that share of the way from the head's tones to the facial hair color, so the skin shows through.

<!-- avatar-spec:facial-hair -->
| Id | Label | Fills the jaw | Mix |
| --- | --- | --- | --- |
| `shortbeard` | Short beard |  |  |
| `fullbeard` | Full beard | yes |  |
| `longbeard` | Long beard | yes |  |
| `goatee` | Goatee |  |  |
| `circlebeard` | Circle beard |  |  |
| `vandyke` | Van Dyke |  |  |
| `soulpatch` | Soul patch |  |  |
| `chinstrap` | Chinstrap |  |  |
| `horseshoe` | Horseshoe |  |  |
| `muttonchops` | Mutton chops |  |  |
| `sideburns` | Sideburns |  |  |
| `moustache` | Moustache |  |  |
| `handlebar` | Handlebar |  |  |
| `pencil` | Pencil moustache |  |  |
| `walrus` | Walrus moustache |  |  |
| `stubble` | Stubble |  |  |
| `lightstubble` | Light stubble |  | 46% |
| `patchystubble` | Patchy stubble |  | 46% |
| `softbeard` | Soft short beard |  | 58% |
| `closebeard` | Close beard |  | 58% |
| `lightmoustache` | Light moustache |  | 46% |
| `extendedgoatee` | Extended goatee |  |  |
| `balbo` | Balbo |  |  |
| `anchor` | Anchor |  |  |
| `ducktail` | Ducktail | yes |  |
| `garibaldi` | Garibaldi | yes |  |
| `chevron` | Chevron moustache |  |  |
| `fumanchu` | Long drooping moustache |  |  |
<!-- /avatar-spec:facial-hair -->

<!-- avatar-spec:hair-colors -->
| Id | Label | Hex | Facial hair |
| --- | --- | --- | --- |
| `default` | Original | as the hairstyle was made | the hair color |
| `black` | Black | #242226 | #59575A |
| `brown` | Brown | #65432E | #8A7060 |
| `chestnut` | Chestnut | #926344 | #AC8871 |
| `auburn` | Auburn | #964630 | #AF7262 |
| `ginger` | Ginger | #C47A42 | #D29A6F |
| `blonde` | Blonde | #D8B878 | #E1C998 |
| `silver` | Silver | #999A9D | #B1B2B5 |
| `white` | White | #E6E1D7 | #ECE8E1 |
| `rose` | Rose | #CA718C | #D793A8 |
| `blue` | Blue | #507DC5 | #7A9CD3 |
| `violet` | Violet | #9268B9 | #AC8CCA |
<!-- /avatar-spec:hair-colors -->

"Facial hair" is the base tone of facial hair in that color. <!-- avatar-spec:hair-rule -->
Hair in a chosen color is shaded like a head of that hex, with the five tones under "Shading". Facial hair in a chosen color starts from the hex mixed 24% toward white, the base in the table, and its five tones are that base mixed 22% and 8% toward #08080C, the base itself, and the base mixed 14% and 30% toward white.
<!-- /avatar-spec:hair-rule -->

### Anchors

Each shape places accessories and facial hair by these points, in portrait units. "Hat x" is the middle line an accessory is centered on, "Top" the top of the skull on that line, and "Seat" where an accessory's lower edge goes, a little into the head. "Width" is half the head's width near the top, "Ear line" the height side pieces hang at, and "Side" half the head's width on the ear line. "Scale" is the head unit accessories are drawn in. "Face x", "Eye line", "Chin" and "Jaw" place facial hair: the face's middle line, the eye line, the chin on the middle line, and half the jaw's width on the mouth line.

<!-- avatar-spec:anchors -->
| Id | Hat x | Top | Seat | Width | Ear line | Side | Scale | Face x | Eye line | Chin | Jaw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `circle` | 0.00 | -0.82 | -0.72 | 0.58 | -0.13 | 0.82 | 1.00 | 0.00 | -0.12 | 0.84 | 0.67 |
| `square` | 0.00 | -0.79 | -0.69 | 0.77 | -0.13 | 0.78 | 1.00 | 0.00 | -0.12 | 0.79 | 0.78 |
| `slab` | 0.00 | -0.52 | -0.42 | 0.90 | -0.06 | 0.92 | 0.96 | 0.00 | -0.06 | 0.72 | 0.92 |
| `tall` | 0.00 | -0.91 | -0.81 | 0.58 | -0.26 | 0.59 | 0.90 | 0.00 | -0.25 | 0.85 | 0.59 |
| `egg` | 0.00 | -0.78 | -0.68 | 0.41 | -0.04 | 0.61 | 0.94 | 0.00 | -0.03 | 0.86 | 0.56 |
| `pebble` | 0.00 | -0.42 | -0.32 | 0.71 | 0.08 | 0.90 | 0.90 | 0.00 | 0.09 | 0.84 | 0.74 |
| `bean` | -0.04 | -0.73 | -0.63 | 0.53 | -0.16 | 0.75 | 0.96 | -0.04 | -0.16 | 0.70 | 0.64 |
| `drop` | 0.00 | -0.66 | -0.56 | 0.34 | 0.10 | 0.65 | 0.90 | 0.00 | 0.11 | 0.86 | 0.53 |
| `ghost` | 0.00 | -0.81 | -0.71 | 0.56 | -0.22 | 0.74 | 0.96 | 0.00 | -0.22 | 0.82 | 0.75 |
| `puff` | 0.00 | -0.79 | -0.69 | 0.59 | -0.10 | 0.78 | 0.94 | 0.00 | -0.09 | 0.83 | 0.67 |
| `flower` | 0.00 | -0.76 | -0.66 | 0.34 | -0.05 | 0.82 | 0.86 | 0.00 | -0.04 | 0.68 | 0.65 |
| `star` | 0.00 | -0.58 | -0.48 | 0.24 | 0.00 | 0.73 | 0.80 | 0.00 | 0.01 | 0.52 | 0.45 |
| `heart` | 0.00 | -0.73 | -0.63 | 0.92 | -0.17 | 0.92 | 0.84 | 0.00 | -0.16 | 0.84 | 0.36 |
| `diamond` | 0.00 | -0.76 | -0.66 | 0.40 | -0.06 | 0.86 | 0.80 | 0.00 | -0.06 | 1.00 | 0.36 |
| `hexagon` | 0.00 | -0.76 | -0.66 | 0.58 | -0.08 | 0.85 | 0.94 | 0.00 | -0.07 | 0.84 | 0.65 |
| `cat` | 0.00 | -0.59 | -0.49 | 0.65 | 0.04 | 0.73 | 0.94 | 0.00 | 0.05 | 0.86 | 0.58 |
| `bear` | 0.00 | -0.58 | -0.48 | 0.73 | 0.04 | 0.72 | 0.94 | 0.00 | 0.05 | 0.85 | 0.58 |
| `sprout` | 0.00 | -0.55 | -0.45 | 0.54 | 0.06 | 0.71 | 0.92 | 0.00 | 0.07 | 0.86 | 0.57 |
| `bunny` | 0.00 | -0.39 | -0.29 | 0.49 | 0.17 | 0.63 | 0.86 | 0.00 | 0.18 | 0.88 | 0.50 |
| `devil` | 0.00 | -0.71 | -0.61 | 0.59 | -0.02 | 0.79 | 0.94 | 0.00 | -0.01 | 0.86 | 0.63 |
| `alien` | 0.00 | -0.52 | -0.42 | 0.61 | 0.06 | 0.81 | 0.94 | 0.00 | 0.07 | 0.86 | 0.66 |
| `mushroom` | 0.00 | -0.74 | -0.64 | 0.74 | 0.35 | 0.41 | 0.80 | 0.00 | 0.36 | 0.86 | 0.41 |
| `onigiri` | 0.00 | -0.64 | -0.54 | 0.30 | 0.20 | 0.66 | 0.80 | 0.00 | 0.21 | 0.81 | 0.89 |
| `slime` | 0.00 | -0.56 | -0.46 | 0.64 | -0.02 | 0.84 | 0.94 | 0.00 | -0.01 | 0.73 | 0.74 |
| `pear` | 0.00 | -0.61 | -0.51 | 0.37 | 0.22 | 0.54 | 0.80 | 0.00 | 0.22 | 0.92 | 0.46 |
| `spiky` | 0.00 | -0.60 | -0.50 | 0.50 | -0.09 | 0.69 | 0.86 | 0.00 | -0.08 | 0.81 | 0.50 |
| `pill` | 0.00 | -0.82 | -0.72 | 0.45 | -0.21 | 0.51 | 0.84 | 0.00 | -0.20 | 0.86 | 0.50 |
| `dome` | 0.00 | -0.74 | -0.64 | 0.53 | 0.04 | 0.84 | 0.96 | 0.00 | 0.04 | 0.82 | 0.93 |
| `blob` | 0.00 | -0.67 | -0.57 | 0.54 | -0.08 | 0.77 | 0.94 | 0.00 | -0.07 | 0.77 | 0.56 |
| `moon` | -0.34 | -0.67 | -0.57 | 0.24 | 0.08 | 0.35 | 0.80 | -0.34 | 0.09 | 0.79 | 0.65 |
| `octagon` | 0.00 | -0.72 | -0.62 | 0.52 | -0.11 | 0.73 | 0.98 | 0.00 | -0.10 | 0.76 | 0.61 |
| `gem` | 0.00 | -0.64 | -0.54 | 0.69 | -0.25 | 0.85 | 0.86 | 0.00 | -0.24 | 0.92 | 0.34 |
| `shield` | 0.00 | -0.80 | -0.70 | 0.77 | -0.26 | 0.77 | 0.92 | 0.00 | -0.25 | 0.88 | 0.55 |
| `lemon` | 0.00 | -0.38 | -0.28 | 0.58 | 0.05 | 0.82 | 0.86 | 0.00 | 0.06 | 0.76 | 0.59 |
| `apple` | 0.00 | -0.42 | -0.32 | 0.69 | 0.08 | 0.79 | 0.94 | 0.00 | 0.09 | 0.76 | 0.66 |
| `pumpkin` | 0.00 | -0.33 | -0.23 | 0.84 | 0.08 | 0.90 | 0.90 | 0.00 | 0.09 | 0.82 | 0.86 |
| `acorn` | 0.00 | -0.68 | -0.58 | 0.73 | 0.16 | 0.63 | 0.80 | 0.00 | 0.17 | 0.91 | 0.34 |
| `cactus` | 0.00 | -0.69 | -0.59 | 0.34 | -0.28 | 0.35 | 0.80 | 0.00 | -0.28 | 0.86 | 0.35 |
| `flame` | 0.00 | -0.54 | -0.44 | 0.37 | 0.24 | 0.54 | 0.80 | 0.00 | 0.25 | 0.88 | 0.43 |
| `snowman` | 0.00 | -0.79 | -0.69 | 0.39 | -0.49 | 0.41 | 0.80 | 0.00 | -0.48 | 0.88 | 0.49 |
| `dumpling` | 0.00 | -0.47 | -0.37 | 0.58 | 0.23 | 0.91 | 0.86 | 0.00 | 0.24 | 0.80 | 0.91 |
| `bell` | 0.00 | -0.83 | -0.73 | 0.36 | -0.07 | 0.58 | 0.84 | 0.00 | -0.06 | 1.06 | 0.85 |
| `ufo` | 0.00 | -0.60 | -0.50 | 0.43 | -0.27 | 0.48 | 0.80 | 0.00 | -0.26 | 0.52 | 0.95 |
| `robot` | 0.00 | -0.50 | -0.40 | 0.69 | -0.02 | 0.89 | 0.96 | 0.00 | -0.02 | 0.74 | 0.69 |
| `crown` | 0.00 | -0.48 | -0.38 | 0.55 | 0.17 | 0.63 | 0.86 | 0.00 | 0.18 | 0.88 | 0.50 |
| `unicorn` | 0.00 | -0.57 | -0.47 | 0.55 | 0.06 | 0.73 | 0.94 | 0.00 | 0.07 | 0.88 | 0.58 |
| `fox` | 0.00 | -0.45 | -0.35 | 0.55 | 0.07 | 0.59 | 0.88 | 0.00 | 0.07 | 0.72 | 0.69 |
| `mouse` | 0.00 | -0.33 | -0.23 | 0.79 | 0.17 | 0.59 | 0.86 | 0.00 | 0.18 | 0.84 | 0.47 |
| `frog` | 0.00 | -0.32 | -0.22 | 0.36 | -0.10 | 0.90 | 0.86 | 0.00 | -0.24 | 0.86 | 0.88 |
| `chick` | 0.00 | -0.55 | -0.45 | 0.54 | 0.00 | 0.70 | 0.94 | 0.00 | 0.01 | 0.86 | 0.58 |
| `octopus` | 0.00 | -0.70 | -0.60 | 0.60 | -0.18 | 0.76 | 0.92 | 0.00 | -0.17 | 0.61 | 0.69 |
| `jellyfish` | 0.00 | -0.60 | -0.50 | 0.60 | -0.22 | 0.73 | 0.90 | 0.00 | -0.21 | 0.23 | 0.81 |
| `pentagon` | 0.00 | -0.66 | -0.56 | 0.49 | -0.04 | 0.80 | 0.92 | 0.00 | -0.03 | 0.83 | 0.62 |
| `plus` | 0.00 | -0.82 | -0.72 | 0.35 | -0.05 | 0.85 | 0.86 | 0.00 | -0.04 | 0.86 | 0.35 |
| `peanut` | 0.00 | -0.28 | -0.18 | 0.36 | 0.16 | 0.87 | 0.80 | 0.00 | 0.17 | 0.75 | 0.82 |
| `leaf` | 0.00 | -0.58 | -0.48 | 0.45 | -0.02 | 0.54 | 0.80 | 0.00 | -0.02 | 0.67 | 0.46 |
| `shell` | 0.00 | -0.59 | -0.49 | 0.78 | -0.08 | 0.67 | 0.80 | 0.00 | -0.08 | 0.91 | 0.23 |
| `tulip` | 0.00 | -0.59 | -0.49 | 0.62 | -0.01 | 0.68 | 0.82 | 0.00 | 0.00 | 0.92 | 0.31 |
| `penguin` | 0.00 | -0.74 | -0.64 | 0.44 | -0.27 | 0.55 | 0.84 | 0.00 | -0.26 | 0.83 | 0.54 |
| `owl` | 0.00 | -0.53 | -0.43 | 0.66 | -0.02 | 0.80 | 0.94 | 0.00 | -0.01 | 0.84 | 0.77 |
| `pig` | 0.00 | -0.44 | -0.34 | 0.64 | -0.03 | 0.76 | 0.88 | 0.00 | -0.03 | 0.74 | 0.67 |
| `koala` | 0.00 | -0.33 | -0.23 | 0.95 | 0.17 | 0.85 | 0.84 | 0.00 | 0.18 | 0.84 | 0.52 |
| `hamster` | 0.00 | -0.44 | -0.34 | 0.44 | 0.01 | 0.58 | 0.82 | 0.00 | 0.02 | 0.87 | 0.82 |
| `puppy` | 0.00 | -0.49 | -0.39 | 0.52 | 0.07 | 0.83 | 0.86 | 0.00 | 0.08 | 0.84 | 0.54 |
| `bat` | 0.00 | -0.33 | -0.23 | 0.89 | 0.17 | 0.97 | 0.84 | 0.00 | 0.18 | 0.84 | 0.47 |
| `hedgehog` | 0.00 | -0.24 | -0.14 | 0.68 | 0.31 | 0.82 | 0.84 | 0.00 | 0.32 | 0.84 | 0.78 |
| `axolotl` | 0.00 | -0.22 | -0.12 | 1.02 | 0.21 | 0.73 | 0.82 | 0.00 | 0.22 | 0.84 | 0.59 |
| `hatch` | 0.00 | -0.65 | -0.55 | 0.46 | -0.18 | 0.55 | 0.80 | 0.00 | -0.17 | 0.86 | 0.72 |
| `bee` | 0.00 | -0.24 | -0.14 | 0.64 | 0.21 | 0.77 | 0.84 | 0.00 | 0.22 | 0.86 | 0.63 |
| `snail` | 0.14 | -0.39 | -0.29 | 0.48 | 0.10 | 0.59 | 0.80 | 0.14 | 0.10 | 0.86 | 0.51 |
| `turtle` | 0.00 | -0.36 | -0.26 | 0.49 | 0.10 | 0.63 | 0.80 | 0.00 | 0.11 | 0.69 | 0.81 |
| `crab` | 0.00 | 0.04 | 0.14 | 0.67 | 0.30 | 0.70 | 0.80 | 0.00 | 0.31 | 0.82 | 0.73 |
| `fish` | -0.22 | -0.29 | -0.19 | 0.42 | 0.24 | 0.86 | 0.80 | -0.22 | 0.25 | 0.82 | 0.54 |
| `whale` | -0.20 | -0.12 | -0.02 | 0.80 | 0.28 | 0.84 | 0.80 | -0.20 | 0.29 | 0.86 | 0.71 |
| `shark` | -0.14 | -0.21 | -0.11 | 0.33 | 0.26 | 0.83 | 0.80 | -0.14 | 0.27 | 0.82 | 0.54 |
| `strawberry` | 0.00 | -0.76 | -0.66 | 0.54 | -0.07 | 0.65 | 0.86 | 0.00 | -0.06 | 0.86 | 0.38 |
| `pineapple` | 0.00 | -0.58 | -0.48 | 0.32 | 0.21 | 0.61 | 0.82 | 0.00 | 0.22 | 0.86 | 0.50 |
| `cupcake` | 0.00 | -0.62 | -0.52 | 0.47 | 0.03 | 0.81 | 0.82 | 0.00 | 0.04 | 0.84 | 0.58 |
| `icecream` | 0.00 | -0.74 | -0.64 | 0.57 | -0.25 | 0.69 | 0.84 | 0.00 | -0.24 | 0.88 | 0.31 |
| `pudding` | 0.00 | -0.50 | -0.40 | 0.61 | 0.05 | 0.67 | 0.86 | 0.00 | 0.06 | 0.86 | 0.79 |
| `toast` | 0.00 | -0.63 | -0.53 | 0.81 | 0.04 | 0.74 | 0.90 | 0.00 | 0.05 | 0.84 | 0.69 |
| `burger` | 0.00 | -0.74 | -0.64 | 0.59 | -0.28 | 0.76 | 0.80 | 0.00 | -0.27 | 0.06 | 0.83 |
| `bowl` | 0.00 | -0.19 | -0.09 | 0.87 | 0.30 | 0.82 | 0.80 | 0.00 | 0.30 | 0.86 | 0.55 |
| `mitten` | 0.10 | -0.65 | -0.55 | 0.45 | -0.13 | 0.74 | 0.84 | 0.10 | -0.12 | 0.85 | 0.47 |
| `tooth` | 0.00 | -0.67 | -0.57 | 0.73 | -0.21 | 0.75 | 0.86 | 0.00 | -0.20 | 0.29 | 0.69 |
| `candle` | 0.00 | -0.34 | -0.24 | 0.57 | 0.08 | 0.55 | 0.80 | 0.00 | 0.09 | 0.86 | 0.55 |
| `bulb` | 0.00 | -0.79 | -0.69 | 0.50 | -0.25 | 0.63 | 0.86 | 0.00 | -0.24 | 0.83 | 0.34 |
| `mug` | -0.14 | -0.48 | -0.38 | 0.61 | 0.06 | 0.61 | 0.90 | -0.14 | 0.07 | 0.84 | 0.61 |
| `potion` | 0.00 | -0.67 | -0.57 | 0.24 | 0.19 | 0.61 | 0.84 | 0.00 | 0.20 | 0.86 | 0.48 |
| `balloon` | 0.00 | -0.85 | -0.75 | 0.49 | -0.24 | 0.65 | 0.90 | 0.00 | -0.23 | 0.75 | 0.41 |
| `present` | 0.00 | -0.37 | -0.27 | 0.81 | 0.33 | 0.71 | 0.84 | 0.00 | 0.34 | 0.86 | 0.71 |
| `padlock` | 0.00 | -0.61 | -0.51 | 0.24 | 0.31 | 0.73 | 0.86 | 0.00 | 0.32 | 0.86 | 0.73 |
| `house` | 0.00 | -0.60 | -0.50 | 0.50 | 0.33 | 0.65 | 0.82 | 0.00 | 0.34 | 0.86 | 0.65 |
| `tv` | 0.00 | -0.40 | -0.30 | 0.87 | 0.04 | 0.87 | 0.92 | 0.00 | 0.05 | 0.76 | 0.87 |
| `gamepad` | 0.00 | -0.14 | -0.04 | 0.67 | 0.22 | 0.77 | 0.80 | 0.00 | 0.23 | 0.58 | 0.89 |
| `trophy` | 0.00 | -0.66 | -0.56 | 0.61 | -0.36 | 0.60 | 0.80 | 0.00 | -0.35 | 0.86 | 0.20 |
| `chest` | 0.00 | -0.32 | -0.22 | 0.74 | 0.44 | 0.83 | 0.80 | 0.00 | 0.44 | 0.86 | 0.83 |
| `bomb` | 0.00 | -0.52 | -0.42 | 0.52 | 0.06 | 0.69 | 0.90 | 0.00 | 0.07 | 0.86 | 0.56 |
| `pawn` | 0.00 | -0.80 | -0.70 | 0.41 | -0.42 | 0.45 | 0.80 | 0.00 | -0.42 | 1.06 | 0.43 |
| `spade` | 0.00 | -0.60 | -0.50 | 0.40 | -0.06 | 0.69 | 0.80 | 0.00 | -0.06 | 0.86 | 0.58 |
| `club` | 0.00 | -0.71 | -0.61 | 0.37 | -0.06 | 0.71 | 0.80 | 0.00 | -0.05 | 0.86 | 0.20 |
| `wizard` | 0.00 | -0.87 | -0.77 | 0.38 | 0.19 | 0.61 | 0.82 | 0.00 | 0.20 | 0.86 | 0.48 |
| `rocket` | 0.00 | -0.76 | -0.66 | 0.24 | -0.12 | 0.37 | 0.80 | 0.00 | -0.11 | 0.86 | 0.71 |
| `planet` | 0.00 | -0.37 | -0.27 | 0.78 | 0.09 | 0.60 | 0.82 | 0.00 | 0.10 | 0.84 | 0.79 |
| `panda` | 0.00 | -0.54 | -0.44 | 0.71 | 0.04 | 0.81 | 0.92 | 0.00 | 0.05 | 0.84 | 0.65 |
| `ladybug` | 0.00 | -0.71 | -0.61 | 0.41 | 0.03 | 0.84 | 0.88 | 0.00 | 0.03 | 0.86 | 0.70 |
| `elephant` | 0.00 | -0.49 | -0.39 | 0.84 | -0.05 | 0.95 | 0.84 | 0.00 | -0.04 | 0.82 | 0.46 |
| `lion` | 0.00 | -0.61 | -0.51 | 0.52 | -0.05 | 0.70 | 0.88 | 0.00 | -0.05 | 0.85 | 0.52 |
| `sheep` | 0.08 | -0.35 | -0.25 | 0.82 | 0.04 | 0.86 | 0.80 | 0.08 | 0.05 | 0.64 | 0.60 |
| `cow` | 0.00 | -0.43 | -0.33 | 0.87 | -0.01 | 0.55 | 0.84 | 0.00 | 0.00 | 0.86 | 0.51 |
| `duck` | -0.20 | -0.68 | -0.58 | 0.45 | -0.08 | 0.63 | 0.80 | -0.20 | -0.07 | 0.83 | 0.75 |
| `seal` | -0.24 | -0.66 | -0.56 | 0.30 | -0.40 | 0.36 | 0.80 | 0.10 | 0.27 | 0.86 | 0.66 |
| `dragon` | 0.00 | -0.51 | -0.41 | 0.52 | 0.04 | 0.85 | 0.90 | 0.00 | 0.05 | 0.82 | 0.54 |
| `dino` | -0.66 | -0.77 | -0.67 | 0.24 | -0.60 | 0.26 | 0.80 | 0.16 | 0.27 | 0.78 | 0.67 |
| `deer` | 0.00 | -0.46 | -0.36 | 0.46 | 0.00 | 0.54 | 0.80 | 0.00 | 0.00 | 0.84 | 0.36 |
| `giraffe` | 0.00 | -0.52 | -0.42 | 0.47 | -0.04 | 0.55 | 0.80 | 0.00 | -0.04 | 0.86 | 0.36 |
| `monkey` | 0.00 | -0.41 | -0.31 | 0.50 | 0.11 | 0.93 | 0.86 | 0.00 | 0.12 | 0.84 | 0.51 |
| `mole` | 0.00 | -0.39 | -0.29 | 0.51 | 0.01 | 0.61 | 0.84 | 0.00 | 0.02 | 0.86 | 0.49 |
| `squid` | 0.00 | -0.70 | -0.60 | 0.49 | 0.06 | 0.51 | 0.80 | 0.00 | 0.07 | 0.63 | 0.46 |
| `ray` | 0.00 | -0.46 | -0.36 | 0.58 | -0.02 | 0.83 | 0.80 | 0.00 | -0.02 | 0.66 | 0.48 |
| `butterfly` | 0.00 | -0.47 | -0.37 | 0.86 | -0.18 | 0.88 | 0.80 | 0.00 | -0.17 | 0.81 | 0.62 |
| `spider` | 0.00 | -0.35 | -0.25 | 0.59 | 0.09 | 0.59 | 0.84 | 0.00 | 0.10 | 0.74 | 0.45 |
| `caterpillar` | -0.40 | -0.43 | -0.33 | 0.43 | 0.01 | 0.49 | 0.80 | -0.40 | 0.02 | 0.54 | 0.74 |
| `yeti` | 0.00 | -0.64 | -0.54 | 0.53 | -0.02 | 0.78 | 0.90 | 0.00 | -0.01 | 0.84 | 0.58 |
| `goose` | -0.46 | -0.80 | -0.70 | 0.22 | -0.56 | 0.24 | 0.80 | 0.12 | 0.35 | 0.86 | 0.59 |
| `toucan` | 0.20 | -0.41 | -0.31 | 0.65 | 0.09 | 0.89 | 0.84 | 0.20 | 0.10 | 0.84 | 0.48 |
| `parrot` | 0.04 | -0.48 | -0.38 | 0.60 | 0.03 | 0.58 | 0.82 | 0.04 | 0.04 | 0.72 | 0.46 |
| `rhino` | 0.00 | -0.14 | -0.04 | 0.72 | 0.22 | 0.85 | 0.80 | 0.00 | 0.23 | 0.76 | 0.82 |
| `hippo` | 0.00 | -0.62 | -0.52 | 0.40 | -0.10 | 0.61 | 0.80 | 0.00 | -0.10 | 0.84 | 0.83 |
| `llama` | 0.00 | -0.67 | -0.57 | 0.45 | -0.20 | 0.51 | 0.80 | 0.00 | -0.20 | 0.86 | 0.43 |
| `camel` | 0.02 | -0.28 | -0.18 | 0.55 | 0.27 | 0.71 | 0.80 | 0.02 | 0.28 | 0.66 | 0.52 |
| `ram` | 0.00 | -0.37 | -0.27 | 0.85 | 0.13 | 0.63 | 0.82 | 0.00 | 0.14 | 0.84 | 0.49 |
| `walrus` | 0.00 | -0.59 | -0.49 | 0.56 | -0.09 | 0.69 | 0.88 | 0.00 | -0.09 | 0.67 | 0.59 |
| `hen` | 0.00 | -0.67 | -0.57 | 0.33 | 0.03 | 0.64 | 0.86 | 0.00 | 0.04 | 0.74 | 0.50 |
| `squirrel` | -0.14 | -0.51 | -0.41 | 0.38 | 0.21 | 0.67 | 0.80 | -0.14 | 0.21 | 0.86 | 0.41 |
| `golem` | 0.00 | -0.67 | -0.57 | 0.24 | 0.05 | 0.58 | 0.86 | 0.00 | 0.06 | 0.64 | 0.55 |
| `cherry` | -0.16 | -0.10 | 0.00 | 0.61 | 0.29 | 0.72 | 0.80 | -0.16 | 0.29 | 0.86 | 0.67 |
| `banana` | 0.00 | 0.24 | 0.34 | 0.77 | 0.50 | 0.75 | 0.80 | 0.00 | 0.51 | 0.84 | 0.49 |
| `carrot` | 0.00 | -0.75 | -0.65 | 0.41 | -0.10 | 0.59 | 0.80 | 0.00 | -0.10 | 0.85 | 0.29 |
| `eggplant` | 0.04 | -0.67 | -0.57 | 0.32 | 0.19 | 0.54 | 0.84 | 0.04 | 0.20 | 0.86 | 0.44 |
| `corn` | 0.00 | -0.82 | -0.72 | 0.37 | -0.10 | 0.49 | 0.80 | 0.00 | -0.09 | 0.76 | 0.65 |
| `cookie` | -0.04 | -0.76 | -0.66 | 0.47 | -0.04 | 0.73 | 0.92 | -0.04 | -0.03 | 0.86 | 0.65 |
| `macaron` | 0.00 | -0.31 | -0.21 | 0.77 | 0.15 | 0.81 | 0.88 | 0.00 | 0.15 | 0.86 | 0.83 |
| `popsicle` | 0.00 | -0.82 | -0.72 | 0.49 | -0.23 | 0.61 | 0.86 | 0.00 | -0.22 | 0.84 | 0.20 |
| `cake` | -0.04 | -0.06 | 0.04 | 0.66 | 0.36 | 0.87 | 0.80 | -0.04 | 0.37 | 0.88 | 0.87 |
| `croissant` | 0.00 | -0.18 | -0.08 | 0.46 | 0.26 | 0.77 | 0.80 | 0.00 | 0.27 | 0.78 | 0.91 |
| `boba` | 0.00 | -0.66 | -0.56 | 0.44 | 0.21 | 0.59 | 0.82 | 0.00 | 0.22 | 0.86 | 0.52 |
| `pizza` | 0.00 | -0.65 | -0.55 | 0.89 | -0.22 | 0.67 | 0.80 | 0.00 | -0.21 | 0.86 | 0.26 |
| `chili` | -0.16 | -0.55 | -0.45 | 0.43 | 0.00 | 0.55 | 0.80 | -0.16 | 0.01 | 0.60 | 0.55 |
| `grapes` | 0.00 | -0.56 | -0.46 | 0.78 | -0.08 | 0.75 | 0.80 | 0.00 | -0.08 | 0.86 | 0.29 |
| `radish` | 0.00 | -0.40 | -0.30 | 0.45 | 0.09 | 0.57 | 0.86 | 0.00 | 0.10 | 0.82 | 0.43 |
| `popcorn` | 0.00 | -0.68 | -0.58 | 0.39 | 0.26 | 0.59 | 0.80 | 0.00 | 0.26 | 0.86 | 0.53 |
| `fries` | 0.00 | -0.60 | -0.50 | 0.55 | 0.27 | 0.63 | 0.82 | 0.00 | 0.28 | 0.86 | 0.58 |
| `hotdog` | 0.00 | -0.22 | -0.12 | 0.69 | 0.19 | 0.95 | 0.86 | 0.00 | 0.20 | 0.82 | 0.69 |
| `candy` | 0.00 | -0.20 | -0.10 | 0.46 | 0.22 | 0.97 | 0.80 | 0.00 | 0.22 | 0.84 | 0.43 |
| `teapot` | 0.00 | -0.31 | -0.21 | 0.40 | 0.23 | 0.72 | 0.88 | 0.00 | 0.23 | 0.84 | 0.53 |
| `cauldron` | 0.00 | -0.40 | -0.30 | 0.53 | 0.12 | 0.65 | 0.90 | 0.00 | 0.13 | 0.86 | 0.52 |
| `bottle` | 0.00 | -0.85 | -0.75 | 0.24 | 0.21 | 0.53 | 0.82 | 0.00 | 0.22 | 0.84 | 0.53 |
| `jar` | 0.00 | -0.72 | -0.62 | 0.57 | 0.10 | 0.69 | 0.94 | 0.00 | 0.11 | 0.84 | 0.69 |
| `hourglass` | 0.00 | -0.87 | -0.77 | 0.33 | -0.39 | 0.49 | 0.80 | 0.00 | -0.39 | 0.87 | 0.49 |
| `lantern` | 0.00 | -0.72 | -0.62 | 0.38 | 0.13 | 0.55 | 0.84 | 0.00 | 0.14 | 0.84 | 0.52 |
| `umbrella` | 0.00 | -0.78 | -0.68 | 0.61 | -0.31 | 0.81 | 0.84 | 0.00 | -0.30 | 0.81 | 0.20 |
| `plant` | 0.00 | -0.41 | -0.31 | 0.24 | 0.28 | 0.60 | 0.80 | 0.00 | 0.28 | 0.86 | 0.54 |
| `globe` | 0.00 | -0.63 | -0.53 | 0.50 | -0.11 | 0.63 | 0.88 | 0.00 | -0.11 | 0.86 | 0.53 |
| `mailbox` | 0.00 | -0.54 | -0.44 | 0.72 | -0.21 | 0.73 | 0.86 | 0.00 | -0.20 | 0.86 | 0.20 |
| `cone` | 0.00 | -0.60 | -0.50 | 0.28 | 0.20 | 0.56 | 0.80 | 0.00 | 0.21 | 0.86 | 0.55 |
| `hydrant` | 0.00 | -0.68 | -0.58 | 0.42 | 0.08 | 0.67 | 0.80 | 0.00 | 0.08 | 0.85 | 0.47 |
| `rain` | 0.00 | -0.66 | -0.56 | 0.42 | -0.13 | 0.77 | 0.84 | 0.00 | -0.12 | 0.34 | 0.79 |
| `sun` | 0.00 | -0.51 | -0.41 | 0.46 | -0.05 | 0.55 | 0.86 | 0.00 | -0.04 | 0.58 | 0.44 |
| `crystal` | 0.00 | -0.74 | -0.64 | 0.36 | 0.30 | 0.89 | 0.80 | 0.00 | 0.31 | 0.86 | 0.88 |
| `tree` | 0.00 | -0.80 | -0.70 | 0.43 | -0.19 | 0.76 | 0.86 | 0.00 | -0.18 | 0.86 | 0.20 |
| `pine` | 0.00 | -0.71 | -0.61 | 0.32 | 0.29 | 0.74 | 0.80 | 0.00 | 0.30 | 0.86 | 0.89 |
| `volcano` | 0.00 | -0.74 | -0.64 | 0.24 | 0.27 | 0.68 | 0.82 | 0.00 | 0.28 | 0.86 | 0.87 |
| `comet` | -0.16 | -0.34 | -0.24 | 0.55 | 0.22 | 0.64 | 0.80 | -0.16 | 0.22 | 0.86 | 0.45 |
| `knight` | 0.00 | -0.69 | -0.59 | 0.43 | -0.04 | 0.61 | 0.90 | 0.00 | -0.03 | 0.86 | 0.70 |
| `ninja` | 0.00 | -0.53 | -0.43 | 0.53 | 0.04 | 0.77 | 0.92 | 0.00 | 0.05 | 0.84 | 0.56 |
| `tower` | 0.00 | -0.50 | -0.40 | 0.56 | 0.12 | 0.55 | 0.90 | 0.00 | 0.13 | 0.84 | 0.55 |
| `lighthouse` | 0.00 | -0.75 | -0.65 | 0.25 | 0.34 | 0.54 | 0.80 | 0.00 | 0.35 | 0.86 | 0.61 |
| `windmill` | 0.00 | -0.37 | -0.27 | 0.37 | 0.36 | 0.51 | 0.80 | 0.00 | 0.37 | 0.86 | 0.60 |
| `camera` | 0.00 | -0.37 | -0.27 | 0.84 | 0.23 | 0.89 | 0.86 | 0.00 | 0.24 | 0.84 | 0.89 |
| `joystick` | 0.00 | -0.76 | -0.66 | 0.25 | 0.40 | 0.83 | 0.80 | 0.00 | 0.41 | 0.86 | 0.82 |
| `arcade` | 0.00 | -0.82 | -0.72 | 0.61 | -0.10 | 0.53 | 0.80 | 0.00 | -0.10 | 0.86 | 0.53 |
| `medal` | 0.00 | -0.34 | -0.24 | 0.37 | 0.21 | 0.55 | 0.86 | 0.00 | 0.22 | 0.86 | 0.45 |
| `satellite` | 0.00 | -0.30 | -0.20 | 0.45 | -0.10 | 0.45 | 0.80 | 0.00 | 0.25 | 0.84 | 0.45 |
| `tornado` | 0.00 | -0.81 | -0.71 | 0.85 | -0.38 | 0.72 | 0.80 | 0.00 | -0.37 | 0.85 | 0.38 |
| `stump` | 0.00 | -0.37 | -0.27 | 0.58 | 0.19 | 0.57 | 0.86 | 0.00 | 0.20 | 0.78 | 0.66 |
| `lamp` | 0.00 | -0.90 | -0.80 | 0.56 | -0.50 | 0.64 | 0.80 | 0.00 | -0.49 | 0.86 | 0.20 |
| `alarm` | 0.00 | -0.49 | -0.39 | 0.50 | 0.03 | 0.63 | 0.88 | 0.00 | 0.03 | 0.76 | 0.51 |
| `hotair` | 0.00 | -0.89 | -0.79 | 0.52 | -0.30 | 0.67 | 0.90 | 0.00 | -0.29 | 0.52 | 0.49 |
| `car` | 0.02 | -0.30 | -0.20 | 0.57 | 0.06 | 0.58 | 0.80 | 0.02 | 0.06 | 0.68 | 0.91 |
| `boat` | -0.08 | -0.30 | -0.20 | 0.49 | 0.08 | 0.49 | 0.80 | -0.08 | 0.09 | 0.86 | 0.82 |
| `sub` | -0.12 | -0.25 | -0.15 | 0.26 | 0.32 | 0.94 | 0.80 | -0.12 | 0.33 | 0.84 | 0.83 |
| `bone` | 0.00 | 0.02 | 0.12 | 0.86 | 0.27 | 0.85 | 0.80 | 0.00 | 0.27 | 0.70 | 0.88 |
| `sock` | 0.20 | -0.78 | -0.68 | 0.54 | -0.19 | 0.49 | 0.86 | 0.20 | -0.18 | 0.84 | 0.69 |
| `tshirt` | 0.00 | -0.44 | -0.34 | 0.97 | 0.07 | 0.82 | 0.86 | 0.00 | 0.08 | 0.84 | 0.55 |
| `tophat` | 0.00 | -0.64 | -0.54 | 0.57 | -0.09 | 0.57 | 0.88 | 0.00 | -0.09 | 0.82 | 0.58 |
| `key` | 0.00 | -0.79 | -0.69 | 0.47 | -0.33 | 0.57 | 0.86 | 0.00 | -0.32 | 0.84 | 0.20 |
| `raccoon` | 0.00 | -0.34 | -0.24 | 0.63 | 0.12 | 0.74 | 0.90 | 0.00 | 0.13 | 0.84 | 0.67 |
| `tiger` | 0.00 | -0.53 | -0.43 | 0.60 | 0.04 | 0.69 | 0.92 | 0.00 | 0.05 | 0.84 | 0.81 |
| `koi` | 0.00 | -0.63 | -0.53 | 0.48 | -0.09 | 0.59 | 0.86 | 0.00 | -0.08 | 0.74 | 0.34 |
| `dalmatian` | 0.00 | -0.49 | -0.39 | 0.50 | -0.01 | 0.74 | 0.86 | 0.00 | 0.00 | 0.84 | 0.45 |
| `zebra` | 0.00 | -0.61 | -0.51 | 0.48 | -0.01 | 0.57 | 0.86 | 0.00 | 0.00 | 0.86 | 0.37 |
| `bust` | 0.00 | -0.81 | -0.71 | 0.62 | -0.25 | 0.60 | 0.98 | 0.00 | -0.24 | 0.88 | 0.42 |
| `moptop` | 0.00 | -0.68 | -0.58 | 0.74 | 0.15 | 0.61 | 0.90 | 0.00 | 0.16 | 0.86 | 0.48 |
| `spikecut` | 0.00 | -0.62 | -0.52 | 0.56 | 0.03 | 0.74 | 0.98 | 0.00 | 0.04 | 0.86 | 0.59 |
| `sidepart` | 0.00 | -0.88 | -0.78 | 0.57 | 0.08 | 0.69 | 0.94 | 0.00 | 0.09 | 0.90 | 0.54 |
| `pompadour` | 0.00 | -0.96 | -0.86 | 0.53 | 0.10 | 0.65 | 0.94 | 0.00 | 0.11 | 0.88 | 0.51 |
| `sculpt` | 0.08 | -0.81 | -0.71 | 0.53 | -0.39 | 0.63 | 0.80 | 0.08 | -0.38 | 0.88 | 0.51 |
| `pyramid` | 0.00 | -0.65 | -0.55 | 0.29 | 0.00 | 0.50 | 1.04 | 0.00 | 0.02 | 0.76 | 0.74 |
| `quiff` | 0.00 | -0.90 | -0.80 | 0.50 | 0.00 | 0.69 | 0.92 | 0.00 | 0.01 | 0.85 | 0.57 |
| `fullbeard` | 0.00 | -0.64 | -0.54 | 0.53 | -0.12 | 0.67 | 0.90 | 0.00 | -0.11 | 0.87 | 0.59 |
| `waves` | 0.00 | -0.80 | -0.70 | 0.70 | -0.09 | 0.79 | 0.86 | 0.00 | -0.08 | 0.87 | 0.54 |
| `tache` | 0.00 | -0.74 | -0.64 | 0.57 | 0.00 | 0.69 | 0.90 | 0.00 | 0.01 | 0.86 | 0.55 |
| `longhair` | 0.00 | -0.74 | -0.64 | 0.58 | -0.05 | 0.79 | 0.84 | 0.00 | -0.04 | 0.62 | 0.77 |
| `longwaves` | 0.00 | -0.79 | -0.69 | 0.61 | -0.05 | 0.82 | 0.84 | 0.00 | -0.04 | 0.62 | 0.90 |
| `deepwaves` | 0.00 | -0.74 | -0.64 | 0.62 | -0.05 | 0.87 | 0.82 | 0.00 | -0.04 | 0.62 | 0.93 |
| `shortfringe` | 0.00 | -0.87 | -0.77 | 0.60 | 0.07 | 0.73 | 0.90 | 0.00 | 0.08 | 0.88 | 0.49 |
| `shortcurls` | 0.00 | -0.83 | -0.73 | 0.61 | 0.24 | 0.63 | 0.80 | 0.00 | 0.25 | 0.88 | 0.41 |
| `layeredfringe` | 0.00 | -0.83 | -0.73 | 0.65 | 0.18 | 0.63 | 0.80 | 0.00 | 0.18 | 0.86 | 0.40 |
| `silkfringe` | -0.03 | -0.91 | -0.81 | 0.55 | 0.16 | 0.62 | 0.98 | -0.03 | 0.17 | 0.72 | 0.40 |
| `shortquiff` | 0.00 | -0.85 | -0.75 | 0.57 | 0.03 | 0.69 | 0.85 | 0.00 | 0.04 | 0.87 | 0.43 |
| `tousled` | 0.00 | -0.81 | -0.71 | 0.68 | 0.03 | 0.68 | 0.85 | 0.00 | 0.04 | 0.86 | 0.43 |
| `shavedbeard` | 0.00 | -0.67 | -0.57 | 0.47 | -0.11 | 0.63 | 0.88 | 0.00 | -0.11 | 0.87 | 0.54 |
| `buzzcut` | 0.00 | -0.61 | -0.51 | 0.58 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `crewcut` | 0.00 | -0.72 | -0.62 | 0.61 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `receding` | 0.00 | -0.66 | -0.56 | 0.63 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `slickback` | 0.00 | -0.91 | -0.81 | 0.50 | 0.09 | 0.71 | 0.88 | 0.00 | 0.09 | 0.87 | 0.50 |
| `fauxhawk` | 0.00 | -0.74 | -0.64 | 0.52 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `pixie` | 0.00 | -0.68 | -0.58 | 0.60 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.44 |
| `cornrows` | 0.00 | -0.63 | -0.53 | 0.60 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `curtains` | 0.00 | -0.82 | -0.72 | 0.61 | 0.09 | 0.73 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `afro` | 0.00 | -0.87 | -0.77 | 0.70 | 0.14 | 0.72 | 0.80 | 0.00 | 0.14 | 0.87 | 0.42 |
| `topknot` | 0.00 | -0.63 | -0.53 | 0.60 | 0.11 | 0.70 | 0.86 | 0.00 | 0.12 | 0.87 | 0.45 |
| `twinbuns` | 0.00 | -0.68 | -0.58 | 0.58 | 0.11 | 0.70 | 0.86 | 0.00 | 0.12 | 0.87 | 0.45 |
| `bob` | 0.00 | -0.74 | -0.64 | 0.67 | 0.11 | 0.69 | 0.84 | 0.00 | 0.12 | 0.87 | 0.41 |
| `lowpony` | 0.00 | -0.68 | -0.58 | 0.64 | 0.09 | 0.77 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `locs` | 0.00 | -0.72 | -0.62 | 0.58 | 0.09 | 0.89 | 0.82 | 0.00 | 0.10 | 0.87 | 0.40 |
| `sideswept` | 0.00 | -0.84 | -0.74 | 0.60 | 0.09 | 0.75 | 0.88 | 0.00 | 0.09 | 0.87 | 0.64 |
| `skinfade` | 0.00 | -0.73 | -0.63 | 0.53 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `undercut` | 0.00 | -0.88 | -0.78 | 0.47 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `frenchcrop` | 0.00 | -0.72 | -0.62 | 0.60 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `mohawk` | 0.00 | -0.87 | -0.77 | 0.24 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `lob` | 0.00 | -0.78 | -0.68 | 0.69 | 0.09 | 0.71 | 0.88 | 0.00 | 0.09 | 0.87 | 0.67 |
| `bluntbangs` | 0.00 | -0.74 | -0.64 | 0.58 | 0.09 | 0.76 | 0.88 | 0.00 | 0.09 | 0.87 | 0.75 |
| `curtainbangs` | 0.00 | -0.74 | -0.64 | 0.59 | 0.09 | 0.82 | 0.88 | 0.00 | 0.09 | 0.87 | 0.94 |
| `shag` | 0.00 | -0.68 | -0.58 | 0.70 | 0.09 | 0.71 | 0.88 | 0.00 | 0.09 | 0.87 | 0.41 |
| `longcurls` | 0.00 | -0.74 | -0.64 | 0.72 | 0.09 | 0.89 | 0.88 | 0.00 | 0.09 | 0.87 | 1.02 |
| `afropuff` | 0.00 | -0.89 | -0.79 | 0.35 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `highpony` | 0.00 | -0.86 | -0.76 | 0.24 | 0.09 | 0.74 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `highbun` | 0.00 | -0.88 | -0.78 | 0.24 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `messybun` | 0.00 | -0.66 | -0.56 | 0.59 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `pigtails` | 0.00 | -0.66 | -0.56 | 0.60 | 0.09 | 0.80 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `boxbraids` | 0.00 | -0.72 | -0.62 | 0.58 | 0.09 | 0.80 | 0.88 | 0.00 | 0.09 | 0.87 | 0.81 |
| `halfup` | 0.00 | -0.74 | -0.64 | 0.58 | 0.09 | 0.76 | 0.88 | 0.00 | 0.09 | 0.87 | 0.75 |
| `texturedcrop` | 0.00 | -0.68 | -0.58 | 0.57 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `taperedcrop` | 0.00 | -0.72 | -0.62 | 0.49 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `softquiff` | 0.00 | -0.86 | -0.76 | 0.52 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `curlycrop` | 0.00 | -0.74 | -0.64 | 0.56 | 0.09 | 0.70 | 0.88 | 0.00 | 0.09 | 0.87 | 0.46 |
| `softbob` | 0.00 | -0.72 | -0.62 | 0.58 | -0.05 | 0.77 | 0.84 | 0.00 | -0.04 | 0.62 | 0.75 |
| `roundbob` | 0.00 | -0.65 | -0.55 | 0.65 | -0.05 | 0.68 | 0.84 | 0.00 | -0.04 | 0.72 | 0.65 |
<!-- /avatar-spec:anchors -->

### Draw order

A 2D portrait is drawn cell by cell, and each cell takes the first of these that applies:

1. The eyes, where the cell is inside the head. An eye is always on top.
2. A part of the head accessory, the first in its list that covers the cell, leaving out parts that go behind the head where the head is.
3. Empty, where the cell is outside the head.
4. The edge band, in the head's edge color.
5. Facial hair.
6. Markings, including a hairstyle's hair.
7. The head's own five tones.

<!-- avatar-spec:cells -->
A cell is painted when its middle is at least 0.42 of a cell inside a shape, and it is an edge cell when it is less than 1.30 of a cell inside, so the edge band is about one cell wide at any size.
<!-- /avatar-spec:cells --> So the edge band runs round the whole outline, over hair, markings and facial hair that reach it, and an accessory covers the edge band but not an eye. OpenGame's 3D heads have no edge band: the lit surface shows the outline.

## Color

### Head palette

"Eyes" is the eye color on that head and "Light" the smaller form inside each eye. "Edge" is the color of the head's edge band and "Contrast marking" the base tone of a `contrast` marking on that head, both described under "Edges and markings". A finish is a color that changes across the head, such as plaid, gold, neon or glass, and the hex is the closest flat color. `mono`, shown to players as "Auto", is black on a light background and white on a dark one. <!-- avatar-spec:dark-ground -->
On a dark background `mono` is a head of #EEEDE9 with eyes #1B1B1B, eye light #EEEDE9, edge #B9B7B2 and contrast marking #424244, shaded #A7A5A0, #CFCDC8, #EEEDE9, #F9F8F5, #FFFFFF from deep to glint. Every other color, its edge included, is the same on both backgrounds.
<!-- /avatar-spec:dark-ground --> <!-- avatar-spec:renamed -->
`ink` is read as `black`; `paper` is read as `white`.
<!-- /avatar-spec:renamed -->

<!-- avatar-spec:head-colors -->
| Id | Label | Hex | Eyes | Light | Edge | Contrast marking | Finish |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mono` | Auto | #1E1E1E | #FFFFFF | #1E1E1E | #0B0B0B | #CBC9C4 |  |
| `black` |  | #1E1E1E | #FFFFFF | #1E1E1E | #0B0B0B | #CBC9C4 |  |
| `charcoal` |  | #3C3D44 | #FFFFFF | #08080C | #26272C | #D1CFCC |  |
| `smoke` |  | #66655F | #FFFFFF | #08080C | #3F3E3C | #D9D7D1 |  |
| `gray` |  | #9A9893 | #1B1B1B | #FFFFFF | #5D5C5A | #313133 |  |
| `silver` |  | #C4C6CF | #222327 | #FFFFFF | #75767D | #3A3A3F |  |
| `white` |  | #F4F3EF | #1B1B1B | #EEEDE9 | #B9B7B2 | #424244 |  |
| `cream` |  | #F9EFCE | #2A2827 | #FFFFFF | #948E7D | #44423F |  |
| `oat` |  | #D1BDB2 | #242123 | #FFFFFF | #7D716C | #3C3839 |  |
| `sand` |  | #E2C79A | #2A2014 | #FFFFFF | #86775E | #403A34 |  |
| `khaki` |  | #B4B478 | #20201B | #FFFFFF | #6C6C4B | #36362E |  |
| `taupe` |  | #8C7E71 | #FFFFFF | #08080C | #554C47 | #2E2C2C |  |
| `bark` |  | #60543C | #FFFFFF | #08080C | #3B3428 | #D8D4CA |  |
| `slate` |  | #697386 | #FFFFFF | #08080C | #404653 | #DADAD9 |  |
| `heather` |  | #9C9CB4 | #FFFFFF | #08080C | #5E5E6D | #32323A |  |
| `mist` |  | #A3C2C4 | #1E2226 | #FFFFFF | #627477 | #33393D |  |
| `ice` |  | #DBF5FF | #26292E | #FFFFFF | #829199 | #3E4349 |  |
| `espresso` |  | #4B2E22 | #FFFFFF | #08080C | #2F1E19 | #D4CCC5 |  |
| `walnut` |  | #6A3F14 | #FFFFFF | #08080C | #412811 | #DAD0C2 |  |
| `cocoa` |  | #8A5A3C | #FFFFFF | #08080C | #533828 | #E0D5CA |  |
| `caramel` |  | #C88B51 | #FFFFFF | #08080C | #775434 | #3A2E26 |  |
| `ochre` |  | #A86C00 | #FFFFFF | #08080C | #654205 | #342816 |  |
| `clay` |  | #B48478 | #FFFFFF | #08080C | #6C504B | #362D2E |  |
| `oxblood` |  | #5A1414 | #FFFFFF | #08080C | #380F11 | #D7C7C2 |  |
| `wine` |  | #7A1F3D | #FFFFFF | #08080C | #4A1528 | #DDC9CB |  |
| `crimson` |  | #B3132F | #FFFFFF | #08080C | #6B0E20 | #E9C7C8 |  |
| `brick` |  | #8E2A12 | #FFFFFF | #08080C | #561C0F | #E1CCC2 |  |
| `red` |  | #E8423A | #FFFFFF | #08080C | #8A2A27 | #412021 |  |
| `rust` |  | #B4532A | #FFFFFF | #08080C | #6C341D | #E9D4C7 |  |
| `coral` |  | #FF7661 | #FFFFFF | #08080C | #97483D | #452A29 |  |
| `salmon` |  | #F7A193 | #291D1F | #FFFFFF | #93615A | #443333 |  |
| `blush` |  | #F9CFD3 | #2A2428 | #FFFFFF | #947B7F | #443C40 |  |
| `peach` |  | #FFBE98 | #3A1E10 | #FFFFFF | #97725D | #453834 |  |
| `tangerine` |  | #FF7A2F | #FFFFFF | #08080C | #974A20 | #452B1F |  |
| `amber` |  | #F38B00 | #FFFFFF | #08080C | #905405 | #432E16 |  |
| `apricot` |  | #FEB45F | #2A2018 | #FFFFFF | #976C3C | #453629 |  |
| `mustard` |  | #D19E18 | #FFFFFF | #08080C | #7D5F13 | #3C321A |  |
| `honey` |  | #FFC539 | #241A05 | #FFFFFF | #977626 | #453A21 |  |
| `lemon` |  | #FFE209 | #2B270C | #FFFFFF | #97860A | #454017 |  |
| `butter` |  | #FFE68C | #2B271E | #FFFFFF | #978956 | #454032 |  |
| `chartreuse` |  | #C2C408 | #22220B | #FFFFFF | #74750A | #393A17 |  |
| `olive` |  | #8A8A2E | #FFFFFF | #08080C | #535320 | #2E2E1F |  |
| `army` |  | #3E4A1C | #FFFFFF | #08080C | #272E15 | #D1D2C4 |  |
| `moss` |  | #5A7A3A | #FFFFFF | #08080C | #384A27 | #D7DCCA |  |
| `lichen` |  | #6E7C62 | #FFFFFF | #08080C | #434B3E | #282B29 |  |
| `lime` |  | #B4E33D | #18200A | #FFFFFF | #6C8728 | #364022 |  |
| `pistachio` |  | #B4D99A | #202520 | #FFFFFF | #6C815E | #363E34 |  |
| `sage` |  | #8BA888 | #FFFFFF | #08080C | #546554 | #2E3431 |  |
| `kelly` |  | #3CC23C | #FFFFFF | #08080C | #267428 | #1E3922 |  |
| `spring` |  | #3DFF6A | #0F2B19 | #FFFFFF | #279743 | #1F452B |  |
| `mint` |  | #3DDC97 | #0C1F17 | #FFFFFF | #27835D | #1F3E34 |  |
| `emerald` |  | #00AC62 | #FFFFFF | #08080C | #03673E | #123529 |  |
| `forest` |  | #2F8D5B | #FFFFFF | #08080C | #1F553A | #1C2F28 |  |
| `ivy` |  | #0F5A22 | #FFFFFF | #08080C | #0C3819 | #C8D5C5 |  |
| `pine` |  | #1E5446 | #FFFFFF | #08080C | #15342E | #CBD4CC |  |
| `jade` |  | #009084 | #FFFFFF | #08080C | #035752 | #122F30 |  |
| `eucalyptus` |  | #6C9090 | #FFFFFF | #08080C | #425759 | #282F32 |  |
| `seafoam` |  | #9DE5C1 | #1D2725 | #FFFFFF | #5E8875 | #32403C |  |
| `aqua` |  | #7AEFE5 | #0B2523 | #FFFFFF | #4A8E8A | #2B4243 |  |
| `teal` |  | #1FB5B0 | #FFFFFF | #08080C | #156C6B | #193739 |  |
| `petrol` |  | #187884 | #FFFFFF | #08080C | #114952 | #CADBD9 |  |
| `cyan` |  | #22CFEA | #0C242B | #FFFFFF | #177B8D | #193C44 |  |
| `cerulean` |  | #009CC0 | #FFFFFF | #08080C | #035E74 | #12323C |  |
| `sky` |  | #5CC8FF | #0E1B2B | #FFFFFF | #397799 | #253A49 |  |
| `azure` |  | #0090FC | #FFFFFF | #08080C | #035797 | #122F48 |  |
| `powder` |  | #B7D3F2 | #21242C | #FFFFFF | #6E7E91 | #373D46 |  |
| `ocean` |  | #006EA9 | #FFFFFF | #08080C | #034367 | #C5D9E0 |  |
| `abyss` |  | #0A4060 | #FFFFFF | #08080C | #09283D | #C7D0D2 |  |
| `denim` |  | #536BA7 | #FFFFFF | #08080C | #344166 | #D5D9E0 |  |
| `navy` |  | #1F2F5C | #FFFFFF | #08080C | #151F3A | #CBCDD1 |  |
| `cobalt` |  | #2E63FF | #FFFFFF | #08080C | #1E3D99 | #CED7F1 |  |
| `royal` |  | #224DBC | #FFFFFF | #08080C | #173072 | #CCD3E4 |  |
| `periwinkle` |  | #98A8FF | #FFFFFF | #08080C | #5C6599 | #313449 |  |
| `dusk` |  | #545478 | #FFFFFF | #08080C | #34344B | #D6D4D6 |  |
| `indigo` |  | #3F2BB5 | #FFFFFF | #08080C | #281C6E | #D1CCE3 |  |
| `wisteria` |  | #9386CC | #FFFFFF | #08080C | #59517B | #302D3E |  |
| `iris` |  | #8662FF | #FFFFFF | #08080C | #513C99 | #2D2649 |  |
| `ultraviolet` |  | #8400FC | #FFFFFF | #08080C | #500397 | #DFC3F1 |  |
| `violet` |  | #C13EFE | #FFFFFF | #08080C | #732798 | #391F48 |  |
| `grape` |  | #84609C | #FFFFFF | #08080C | #503B60 | #DFD6DE |  |
| `lavender` |  | #C3A6FF | #22163A | #FFFFFF | #746499 | #393449 |  |
| `lilac` |  | #E4C8F7 | #27232D | #FFFFFF | #887794 | #403A47 |  |
| `aubergine` |  | #3A1050 | #FFFFFF | #08080C | #250D33 | #D0C6CE |  |
| `plum` |  | #6B2E7A | #FFFFFF | #08080C | #411E4C | #DACCD7 |  |
| `purple` |  | #B400B4 | #FFFFFF | #08080C | #6C036D | #E9C3E2 |  |
| `orchid` |  | #D67EE0 | #FFFFFF | #08080C | #7F4C87 | #3D2C42 |  |
| `mauve` |  | #B07A9A | #FFFFFF | #08080C | #694A5E | #362B34 |  |
| `magenta` |  | #E0349C | #FFFFFF | #08080C | #852260 | #3F1D35 |  |
| `fuchsia` |  | #FF2EE0 | #FFFFFF | #08080C | #971E87 | #451C42 |  |
| `raspberry` |  | #C0185F | #FFFFFF | #08080C | #73113C | #EBC8D1 |  |
| `pink` |  | #FF8FC7 | #3A0F24 | #FFFFFF | #975678 | #452F3D |  |
| `rose` |  | #FF4F7B | #FFFFFF | #08080C | #97314C | #45222E |  |
| `gold` |  | #D29C2A | #2A1A04 | #FFFFFF | #412B0B | #3C321E | yes |
| `chrome` |  | #98A5B8 | #10141C | #FFFFFF | #151822 | #31333A | yes |
| `platinum` |  | #C6C5CB | #1C1C22 | #FFFFFF | #56555A | #3A3A3E | yes |
| `copper` |  | #C86A3C | #2A0E04 | #FFFFFF | #36150B | #3A2822 | yes |
| `bronze` |  | #A27434 | #22160A | #FFFFFF | #2B1D0D | #332A20 | yes |
| `rosegold` | Rose gold | #D8968A | #3A1C1A | #FFFFFF | #4D2A29 | #3E3031 | yes |
| `gunmetal` |  | #454B57 | #FFFFFF | #08080C | #0F1015 | #D3D2D0 | yes |
| `holo` | Holographic | #C9B0FF | #22162E | #FFFFFF | #786999 | #3B3649 | yes |
| `pearl` |  | #F2EDE6 | #2A2420 | #FFFFFF | #847F7B | #434244 | yes |
| `opal` |  | #E4EEF0 | #27282C | #FFFFFF | #888D90 | #404246 | yes |
| `oilslick` | Oil slick | #3A1F6E | #FFFFFF | #08080C | #251545 | #D0C9D4 | yes |
| `aurora` |  | #16264E | #FFFFFF | #08080C | #101932 | #C9CBCE | yes |
| `sunset` |  | #FF5C8A | #FFFFFF | #08080C | #973955 | #452531 | yes |
| `tide` |  | #1E80CC | #FFFFFF | #08080C | #154E7B | #182C3E | yes |
| `berry` |  | #B4308F | #FFFFFF | #08080C | #6C1F58 | #E9CDDB | yes |
| `mintlemon` | Mint lemon | #FFF07A | #2B281B | #FFFFFF | #978F4C | #45422E | yes |
| `fire` |  | #FF7A1A | #FFFFFF | #08080C | #974A14 | #452B1B | yes |
| `candy` |  | #C6A8FF | #231E2E | #FFFFFF | #766599 | #3A3449 | yes |
| `peachsky` | Peach sky | #FFC59E | #2B2220 | #FFFFFF | #977661 | #453A35 | yes |
| `neonpink` | Neon pink | #FF2E9A | #FFFFFF | #29091F | #FF2E9A | #451C34 | yes |
| `neongreen` | Neon green | #39FF3C | #FFFFFF | #0A220E | #39FF3C | #1E4522 | yes |
| `neonblue` | Neon blue | #1FD8FF | #FFFFFF | #09162D | #1FD8FF | #193E49 | yes |
| `glass` |  | #CDE7EF | #173039 | #FFFFFF | #436372 | #3B4145 | yes |
| `jelly` |  | #FF5670 | #FFFFFF | #08080C | #5B091E | #45242C | yes |
| `stripes` |  | #26336A | #FFFFFF | #08080C | #192143 | #CCCDD4 | yes |
| `spots` |  | #2FB59A | #FFFFFF | #08080C | #1F6C5E | #1C3734 | yes |
| `checker` |  | #E43A3A | #FFFFFF | #08080C | #882527 | #401E21 | yes |
| `camo` |  | #6B7A3A | #FFFFFF | #08080C | #414A27 | #DADCCA | yes |
| `galaxy` |  | #1C1848 | #FFFFFF | #08080C | #14112F | #CAC8CD | yes |
| `marble` |  | #EEECE6 | #24221F | #FFFFFF | #8D8C8A | #424244 | yes |
| `wood` |  | #C99158 | #FFFFFF | #08080C | #785738 | #3B2F27 | yes |
| `plaid` |  | #C42A33 | #FFFFFF | #08080C | #751C23 | #ECCCC9 | yes |
| `paint` | Paint pour | #E8489E | #1B1840 | #FFFFFF | #908D90 | #434246 | yes |
<!-- /avatar-spec:head-colors -->

### Shading

OpenGame shades a head in five tones made from the hex value, lit from the top left. Each mixes the swatch toward a near-black or white:

<!-- avatar-spec:tones -->
| Tone | Where it falls | Mix |
| --- | --- | --- |
| deep | the edge away from the light | 50% toward #08080C |
| shade | the shadow side | 26% toward #08080C |
| base | most of the head | the swatch |
| light | the lit side | 20% toward white |
| glint | the highlight, top left | 48% toward white |
<!-- /avatar-spec:tones -->

### Edges and markings

In a 2D portrait the head has a band about one cell wide just inside its outline, drawn in the edge color from the head palette. The edge color does not change with the background apart from `mono`, so a dark head on a dark background keeps a dark edge: OpenGame draws no light outline around it. <!-- avatar-spec:edges -->
The edge is darker than the head's base tone on every color except `neonpink`, `neongreen` and `neonblue`. For a plain color it is the swatch mixed 42% toward #08080C, except `mono`, `black` and `white`, whose edges are in the table. An accessory part's edge follows the same rule for its own color, a hex value or a head palette entry.
<!-- /avatar-spec:edges -->

Markings are a head's second color: a hairstyle's hair, a panda's patches. <!-- avatar-spec:marking-rule -->
Each of a marking's five tones is the head's tone at the same step, in that background's inks, mixed 80% toward the marking's color, so a patch is lit and dithered like the head under it.
<!-- /avatar-spec:marking-rule --> The marking tone in the shapes table picks that color:

<!-- avatar-spec:marking-tones -->
| Marking tone | Mixed toward |
| --- | --- |
| `contrast` | #17171B when the head's base tone has a relative luminance over 0.18, otherwise #F6F4EE |
| `light` | #F6F4EE |
| `dark` | #17171B |
| `grey` | #6E6E6B |
| `brown` | #5C3A24 |
<!-- /avatar-spec:marking-tones -->

On a hairstyle with a hair color chosen, the hair takes that hair color instead, as described under "Facial hair and hair color".

Facial hair takes the first of these that is set: the facial hair color, the hair color on a hairstyle, then the marking rule above. When a look has facial hair, a shape whose markings name no tone uses `dark` instead of `contrast`, for both its markings and its facial hair, and a shape with no markings uses `dark` for the facial hair. A soft style is then mixed from the head's tones as its "Mix" says.

<!-- avatar-spec:eye-keep -->
An eye over a marking or facial hair keeps the head palette's eye colors while the eye color has a contrast ratio of at least 2.5 against the marking's base tone. Below that, the eye takes the head's base tone and its light takes the marking's light tone.
<!-- /avatar-spec:eye-keep -->

Markings and facial hair have no edge of their own. Where they reach the outline, the head's edge band runs over them.

### Clothing colors

The outfit recipe gives a color to the shirt, the bottoms and the shoes, and one color shared by the accessories.

<!-- avatar-spec:cloth-colors -->
| Id | Label | Hex |
| --- | --- | --- |
| `avatar` | Avatar | the head color, darkened by garment |
| `ink` | Ink | #252522 |
| `chalk` | Chalk | #EEEDE6 |
| `slate` | Slate | #727A83 |
| `blue` | Blue | #0054FF |
| `green` | Green | #4F8567 |
| `rose` | Rose | #C67488 |
| `amber` | Amber | #C89443 |
| `plum` | Plum | #835985 |
| `coral` | Coral | #EA8067 |
| `red` | Red | #CC4245 |
| `orange` | Orange | #DF782B |
| `lemon` | Lemon | #E3D75B |
| `mint` | Mint | #99C9A8 |
| `cyan` | Cyan | #4BC3CB |
| `teal` | Teal | #2F807D |
| `sky` | Sky | #83B7D8 |
| `violet` | Violet | #6B55B3 |
| `lavender` | Lavender | #B7A3D0 |
| `magenta` | Magenta | #B34488 |
| `sand` | Sand | #C7B08C |
| `cocoa` | Cocoa | #775746 |
| `silver` | Silver | #B5BABE |
| `gold` | Gold | #B79A47 |
| `match` | Match avatar | the head color, unchanged |
<!-- /avatar-spec:cloth-colors -->

### Colors that follow the head

`readAvatar` marks these with `followsHead: true` and gives the head's hex. `match` is the head's color unchanged. <!-- avatar-spec:follow-rule -->
`avatar` is the head's color darkened by garment: each channel `c` becomes `c × f + 35 × (1 − f)`, with `f` from this table.
<!-- /avatar-spec:follow-rule -->

<!-- avatar-spec:follows-head -->
| Garment | Factor |
| --- | --- |
| Bottoms | 0.45 |
| Shoes | 0.94 |
| Body accessories | 0.65 |
| Shirt, `tee` | 0.77 |
| Shirt, `ringer` | 0.86 |
| Shirt, `stripe` | 0.80 |
| Shirt, `hoodie` | 0.68 |
| Shirt, `varsity` | 0.51 |
| Shirt, `polo` | 0.74 |
| Shirt, `henley` | 0.71 |
| Shirt, `sweatshirt` | 0.62 |
| Shirt, `cardigan` | 0.60 |
| Shirt, `jacket` | 0.53 |
| Shirt, `vest` | 0.52 |
| Shirt, `tank` | 0.75 |
| Shirt, `baseball` | 0.83 |
| Shirt, `rugby` | 0.67 |
| Shirt, `overshirt` | 0.58 |
| Shirt, `raincoat` | 0.77 |
| Shirt, `overalls` | 0.85 |
| Shirt, `blazer` | 0.49 |
| Shirt, `trackjacket` | 0.59 |
| Shirt, `turtleneck` | 0.57 |
| Shirt, `knit` | 0.82 |
| Shirt, `tunic` | 0.69 |
| Shirt, `poncho` | 0.65 |
| Shirt, `openjacket` | 0.53 |
<!-- /avatar-spec:follows-head -->

## The body and clothes

The outfit recipe starts with a version, then the body, legs, shirt, bottoms, accessories, shoes and the four colors. <!-- avatar-spec:defaults -->
The default head is `circle.classic.white`. The plain body is `c3.classic.regular.none.shorts.none.classic.avatar.avatar.avatar.avatar`, and a new player starts in `c3.classic.regular.hoodie.jeans.backpack.jumpcourt.avatar.avatar.chalk.avatar`.
<!-- /avatar-spec:defaults -->

### Shirts

`none` leaves the torso uncovered, in the head's color.

<!-- avatar-spec:shirts -->
| Id | Label | Sleeves | What it is |
| --- | --- | --- | --- |
| `none` | None | Bare | Your avatar's own color |
| `tee` | T-shirt | Short | A plain everyday tee |
| `ringer` | Ringer | Short | A tee with contrasting trim |
| `stripe` | Striped | Short | A tee with a bold stripe |
| `hoodie` | Hoodie | Long | A hood and a front pocket |
| `varsity` | Varsity | Long | A jacket with contrasting sleeves |
| `polo` | Polo | Short | A collar and a short button placket |
| `henley` | Henley | Short | A collarless top with three buttons |
| `sweatshirt` | Sweatshirt | Long | A crew neck with ribbed cuffs |
| `cardigan` | Cardigan | Long | An open knit with a button front |
| `jacket` | Jacket | Long | A short jacket with a zip front |
| `vest` | Vest | None | A sleeveless layer with front pockets |
| `tank` | Tank top | None | A sleeveless top with curved neck trim |
| `baseball` | Baseball tee | Short | Contrasting sleeves and a stitched hem |
| `rugby` | Rugby shirt | Long | Wide stripes and a contrasting collar |
| `overshirt` | Overshirt | Long | A button front with two chest pockets |
| `raincoat` | Raincoat | Long | A long coat with a storm flap |
| `overalls` | Overalls | Short | A bib front with two shoulder straps |
| `blazer` | Blazer | Long | A tailored jacket with folded lapels |
| `trackjacket` | Track jacket | Long | A zip jacket with striped sleeves |
| `turtleneck` | Turtleneck | Long | A close fit with a rolled collar |
| `knit` | Cable knit | Long | A thick sweater with raised knit panels |
| `tunic` | Tunic | Long | A long top with a split hem |
| `poncho` | Poncho | None | A wide, draped layer over your shoulders |
| `openjacket` | Open jacket | Long | An open jacket over a white tee |
<!-- /avatar-spec:shirts -->

### Bottoms

<!-- avatar-spec:bottoms -->
| Id | Label | Cut | What it is |
| --- | --- | --- | --- |
| `shorts` | Shorts | Shorts | Above the knee |
| `trousers` | Trousers | Full length | A straight, full-length fit |
| `joggers` | Joggers | Full length | A relaxed fit with cuffs |
| `skirt` | Skirt | Skirt | A short, flared shape |
| `chinos` | Chinos | Full length | A tapered fit with rolled hems |
| `jeans` | Jeans | Full length | A straight fit with patch pockets |
| `cargos` | Cargo trousers | Full length | A relaxed fit with side pockets |
| `culottes` | Culottes | Shorts | Wide legs cropped below the knee |
| `flares` | Flares | Full length | A fitted leg with a wider hem |
| `leggings` | Leggings | Full length | A close fit from waist to ankle |
| `pleated` | Pleated skirt | Skirt | A short skirt with folded panels |
| `kilt` | Kilt | Skirt | A wrap skirt with a side buckle |
| `bermuda` | Bermuda shorts | Shorts | A straight fit down to the knee |
| `bikers` | Bike shorts | Shorts | A close fit ending above the knee |
| `parachute` | Parachute trousers | Full length | Wide legs gathered at the ankles |
| `bloomers` | Bloomers | Shorts | Rounded shorts with gathered hems |
| `denimshorts` | Denim shorts | Shorts | Short legs with patch pockets and folded hems |
| `wrapskirt` | Wrap skirt | Skirt | A long skirt with an overlapping front |
<!-- /avatar-spec:bottoms -->

### Body accessories

Each accessory has a slot on the body. <!-- avatar-spec:conflicts -->
A player wears at most four, one in each slot. These pairs use different slots and are not worn together: `cape` and `pauldrons`, `harness` and `backpack`, `harness` and `rocketpack`, `floatie` and `cape`, `floatie` and `satchel`, `floatie` and `crossbody`.
<!-- /avatar-spec:conflicts -->

<!-- avatar-spec:own-colors -->
These ignore the accessory color and keep the materials they are made of: `oakwatch` (Octagonal watch), `nautiluswatch` (Porthole watch), `overseaswatch` (Blue sport watch), `datejustwatch` (Fluted watch).
<!-- /avatar-spec:own-colors -->

<!-- avatar-spec:body-accessories -->
| Id | Label | Slot | What it is |
| --- | --- | --- | --- |
| `backpack` | Backpack | Back | A small pack with shoulder straps |
| `crossbody` | Crossbody | Across the chest | A bag worn across your body |
| `scarf` | Scarf | Neck | A scarf around your neck |
| `cape` | Cape | Back | A cape behind your shoulders |
| `satchel` | Satchel | Across the chest | A flap bag carried at your side |
| `belt` | Belt | Waist | A waist strap with a square buckle |
| `sash` | Sash | Across the chest | A wide ribbon across your chest |
| `bowtie` | Bow tie | Neck | A small bow at your collar |
| `wristband` | Wristband | Wristband | A cuff around your wrist |
| `wings` | Wings | Back | A pair of small wings on your back |
| `bandolier` | Utility strap | Across the chest | A chest strap with small pouches |
| `apron` | Apron | Waist | A tied apron with a front pocket |
| `floatie` | Swim ring | Waist | A round float around your waist |
| `medal` | Medal | Neck | A medal on a ribbon around your neck |
| `watch` | Watch | Watch | A wrist strap with a round watch face |
| `canteen` | Canteen | Waist | A small bottle carried at your hip |
| `pauldrons` | Shoulder armor | Shoulders | A rounded plate over each shoulder |
| `harness` | Harness | Across the chest | Crossed straps with a chest buckle |
| `rocketpack` | Rocket pack | Back | Twin rockets strapped to your back |
| `oakwatch` | Octagonal watch | Watch | An eight-sided steel case and linked bracelet |
| `nautiluswatch` | Porthole watch | Watch | A rounded square case with side tabs |
| `overseaswatch` | Blue sport watch | Watch | A blue dial with a notched steel bezel |
| `datejustwatch` | Fluted watch | Watch | A ridged bezel with a date window |
<!-- /avatar-spec:body-accessories -->

### Shoes

Sneakers, sized in H, with the soles flat on the ground. <!-- avatar-spec:sole -->
Soles are #F8EFD0 whatever the shoe color.
<!-- /avatar-spec:sole -->

<!-- avatar-spec:shoes -->
| Id | Label | What it is | Length | Width | Sole | Height |
| --- | --- | --- | --- | --- | --- | --- |
| `classic` | Classic | Rounded sneakers with a simple sole | 0.42 | 0.32 | 0.08 | 0.21 |
| `lowtop` | Low tops | A low collar with a slim layered sole | 0.43 | 0.30 | 0.07 | 0.18 |
| `hightop` | High tops | An ankle collar and a padded tongue | 0.42 | 0.31 | 0.08 | 0.22 |
| `runner` | Runners | A curved sole with layered side panels | 0.47 | 0.30 | 0.09 | 0.19 |
| `chunky` | Chunky | A wide upper on a thick sculpted sole | 0.46 | 0.36 | 0.12 | 0.26 |
| `court` | Court | A smooth upper with a rounded toe cap | 0.44 | 0.32 | 0.07 | 0.20 |
| `skate` | Skate | A broad padded tongue and a flat sole | 0.42 | 0.34 | 0.10 | 0.23 |
| `canvas` | Canvas | A light upper with a rubber toe cap | 0.42 | 0.29 | 0.07 | 0.18 |
| `retro` | Retro | A narrow toe with contrasting side stripes | 0.45 | 0.30 | 0.07 | 0.19 |
| `trail` | Trail | A reinforced toe and a ridged outsole | 0.46 | 0.32 | 0.10 | 0.23 |
| `slipon` | Slip-ons | A smooth upper with elastic side panels | 0.44 | 0.32 | 0.07 | 0.19 |
| `platform` | Platform | A simple upper on a tall flat sole | 0.43 | 0.32 | 0.13 | 0.25 |
| `airforce` | Air court | A perforated low top with stitched panels and a broad sole | 0.45 | 0.33 | 0.11 | 0.24 |
| `jumpcourt` | Jump court | A layered high top with ankle panels | 0.45 | 0.32 | 0.09 | 0.22 |
<!-- /avatar-spec:shoes -->

## Parts you do not have

OpenGame adds shapes, eyes, garments and colors over time. When your game is missing a part, draw your default for that part and keep the rest of the OG. When `readAvatar` returns `outfit: null`, draw the player's head on your default body. A `hex` of `null` is a color newer than your SDK, so use your default color for that part.

## Check your drawing

- Compare it with the player's portrait from `portraitUrl`. The head's outline, color and eyes match. On a dark background, ask for the dark portrait and draw `mono` white.
- In 2D, the edge band is the head palette's edge color on both backgrounds. A light outline around a dark head is not part of an OG.
- Shrink it to 32 pixels tall. You can still tell the head color and the eyes.
- The head is broader than the torso and about 40% of the height.
- The mittens and neck are the head's color.
- Try a pale head (`white`), a dark one (`black`) and a finish (`gold`). The eyes stay visible on all three.
