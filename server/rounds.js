/**
 * Built-in mystery rounds. Answers are never sent to clients until reveal.
 */
export const ROUNDS = [
  {
    id: "mug",
    answer: "Coffee Mug",
    aliases: ["mug", "coffee mug", "cup", "coffee cup", "tea mug"],
    hints: [
      "Common on desks and kitchen counters",
      "Often holds something hot to drink",
      "Many have a single handle on the side",
    ],
    image: "/assets/mug.svg",
  },
  {
    id: "keyboard",
    answer: "Keyboard",
    aliases: ["computer keyboard", "mechanical keyboard", "qwerty"],
    hints: [
      "You probably tap it hundreds of times a day",
      "It has rows of switches or keys",
      "Often paired with a mouse or trackpad",
    ],
    image: "/assets/keyboard.svg",
  },
  {
    id: "plant",
    answer: "Houseplant",
    aliases: ["plant", "potted plant", "succulent", "desk plant"],
    hints: [
      "It might sit near a window for light",
      "People say it improves the vibe of a room",
      "You might water it on a schedule",
    ],
    image: "/assets/plant.svg",
  },
  {
    id: "headphones",
    answer: "Headphones",
    aliases: ["headset", "earphones", "cans"],
    hints: [
      "Worn on or over the ears",
      "Common during calls and focus time",
      "Can be wired or wireless",
    ],
    image: "/assets/headphones.svg",
  },
  {
    id: "clock",
    answer: "Wall Clock",
    aliases: ["clock", "analog clock", "timepiece"],
    hints: [
      "Shows hours and minutes at a glance",
      "Often circular with numbers or marks",
      "You might check it before your next meeting",
    ],
    image: "/assets/clock.svg",
  },
];

export const ROUND_DURATION_MS = 120_000;
export const HINT_INTERVAL_MS = 24_000;
export const MAX_HINTS = 3;
export const WRONG_GUESS_PENALTY = 1;
export const MAX_ROUND_SCORE = 100;
export const SPEED_ROUND_BONUS = 25;
