/**
 * DYDTT — Little food bowl next to the cat in the top bar.
 * Only appears once the secret page has been found; tapping it opens the cat game.
 * Full when he's fed, empty when he's hungry. A gold coin pops out when a
 * ticked-off task earns one.
 */

import { pixelSvg } from './Mascot.js';
import { BOWL_FULL, BOWL_EMPTY, BOWL_PALETTE, COIN, ROOM } from '../pet/sprites.js';
import { getPet, subscribePet } from '../pet/petStore.js';

export const BOWL_FULL_AT = 50;          // hunger at or above → full bowl

export function createPetBowl({ scale = 2, onOpen } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pet-bowl';
  btn.setAttribute('aria-label', 'Visit your cat');
  btn.style.setProperty('--mascot-px', `${scale}px`);

  const full = pixelSvg(BOWL_FULL, BOWL_PALETTE, scale, 'pet-bowl__img pet-bowl__img--full');
  const empty = pixelSvg(BOWL_EMPTY, BOWL_PALETTE, scale, 'pet-bowl__img pet-bowl__img--empty');
  btn.append(full, empty);

  const render = (pet) => {
    btn.hidden = !pet?.found;
    if (!pet) return;
    const isFull = pet.hunger >= BOWL_FULL_AT;
    full.style.display = isFull ? '' : 'none';
    empty.style.display = isFull ? 'none' : '';
    btn.dataset.full = String(isFull);
  };

  const coinPop = () => {
    const coin = pixelSvg(COIN, ROOM, scale, 'pet-bowl__coin');
    btn.appendChild(coin);
    setTimeout(() => coin.remove(), 1600);
  };

  btn.addEventListener('click', () => onOpen?.());
  render(getPet());
  btn.stopBowl = subscribePet((pet, ev) => {
    render(pet);
    if (ev?.earned) coinPop();
  });
  return btn;
}
