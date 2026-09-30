/**
 * DYDTT Phase 1 — BurgerMenu Storybook Stories
 */

import BurgerMenu from '../components/BurgerMenu.js';

export default {
  title:     'Components/BurgerMenu',
  tags:      ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Single hamburger button. Animates to X when open. ' +
                   'Manages aria-expanded and emits open/close events.',
      },
    },
  },
  argTypes: {
    onOpen:  { action: 'open'  },
    onClose: { action: 'close' },
  },
};

function mount(args = {}) {
  const container = document.createElement('div');
  container.style.cssText = 'position:relative;width:48px;height:48px;';
  const menu = new BurgerMenu({ container });
  menu.on('open',  () => args.onOpen?.());
  menu.on('close', () => args.onClose?.());
  return container;
}

export const Default = {
  name: 'Closed (default)',
  render: (args) => mount(args),
};

export const OpenState = {
  name: 'Open (X state)',
  render: (args) => {
    const el   = mount(args);
    const btn  = el.querySelector('.burger-btn');
    btn.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close menu');
    return el;
  },
};

export const KeyboardFocus = {
  name: 'Keyboard focus ring',
  render: (args) => {
    const el  = mount(args);
    const btn = el.querySelector('.burger-btn');
    setTimeout(() => btn.focus(), 100);
    return el;
  },
  parameters: {
    docs: {
      description: { story: 'Tab to the burger to see the focus ring.' },
    },
  },
};

export const ToggleCycle = {
  name: 'Toggle cycle (play)',
  render: (args) => {
    const container = document.createElement('div');
    container.style.cssText = 'position:relative;width:48px;height:48px;';
    const menu = new BurgerMenu({ container });
    menu.on('open',  () => args.onOpen?.());
    menu.on('close', () => args.onClose?.());
    return container;
  },
  play: async ({ canvasElement }) => {
    const { userEvent } = await import('@storybook/test');
    const btn = canvasElement.querySelector('.burger-btn');
    await userEvent.click(btn);
    await new Promise(r => setTimeout(r, 400));
    await userEvent.click(btn);
  },
};
