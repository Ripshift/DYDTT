import '../src/styles/tokens.css';
import '../src/styles/reset.css';
import '../src/styles/base.css';
import '../src/styles/layout.css';
import '../src/styles/components.css';
import '../src/styles/animations.css';

/** @type { import('@storybook/html').Preview } */
const preview = {
  parameters: {
    backgrounds: {
      default: 'DYDTT Dark',
      values: [
        { name: 'DYDTT Dark',    value: '#141414' },
        { name: 'DYDTT Surface', value: '#1E1E1E' },
        { name: 'DYDTT Raised',  value: '#272727' },
        { name: 'Light (a11y)',  value: '#FFFFFF' },
      ],
    },
    viewport: {
      viewports: {
        squareMobile: {
          name: 'Square Mobile (390x390)',
          styles: { width: '390px', height: '390px' },
          type: 'mobile',
        },
        iPhoneSE: {
          name: 'iPhone SE (375x667)',
          styles: { width: '375px', height: '667px' },
          type: 'mobile',
        },
        iPhone14: {
          name: 'iPhone 14 Pro (393x852)',
          styles: { width: '393px', height: '852px' },
          type: 'mobile',
        },
        pixelXL: {
          name: 'Pixel 7 (412x915)',
          styles: { width: '412px', height: '915px' },
          type: 'mobile',
        },
        tablet: {
          name: 'Tablet (768x1024)',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
      },
      defaultViewport: 'squareMobile',
    },
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'button-name',    enabled: true },
          { id: 'aria-roles',     enabled: true },
        ],
      },
      options: {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
        },
      },
    },
    controls: {
      matchers: {
        color:   /(background|color)$/i,
        date:    /date$/i,
        boolean: /^(is|has|show|done|checked|disabled|open)/i,
      },
    },
  },
  decorators: [
    (Story) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = [
        'padding: 24px',
        'min-height: 100vh',
        'background: var(--color-bg-base)',
        'color: var(--color-text-primary)',
        'font-family: var(--font-body)',
        'display: flex',
        'align-items: flex-start',
        'justify-content: center',
      ].join(';');
      wrapper.appendChild(Story());
      return wrapper;
    },
  ],
  globalTypes: {
    reducedMotion: {
      description: 'Simulate reduced motion preference',
      defaultValue: 'no-preference',
      toolbar: {
        title: 'Motion',
        icon: 'circlehollow',
        items: [
          { value: 'no-preference', title: 'Full motion'    },
          { value: 'reduce',        title: 'Reduced motion' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
