// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createTextInsertPicker } from '../src/renderer/editor/shellWiring.js';
it('creates exactly one text box on main click and only opens chooser on arrow', () => {
  const textBox = vi.fn(), codeBlock = vi.fn();
  const picker = createTextInsertPicker({ textBox, codeBlock });
  document.body.replaceChildren(picker);
  const main = [...picker.querySelectorAll('button')].find(b => b.textContent === 'Text')!;
  main.click();
  expect(textBox).toHaveBeenCalledTimes(1);
  expect(picker.querySelector('[role=menu]')).toBeNull();
  const arrow = picker.querySelector<HTMLButtonElement>('[aria-haspopup=menu]')!;
  arrow.click();
  expect(textBox).toHaveBeenCalledTimes(1);
  expect(document.activeElement?.textContent).toBe('Text box');
  [...picker.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b => b.textContent === 'Code block')!.click();
  expect(codeBlock).toHaveBeenCalledTimes(1);
  arrow.click();
  arrow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(picker.querySelector('[role=menu]')).toBeNull();
  expect(document.activeElement).toBe(arrow);
});
