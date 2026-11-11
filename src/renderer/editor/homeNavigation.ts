export function createHomeButton(options: { save: () => Promise<void>; open: () => void; error: (message: string) => void }): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Home';
  button.title = 'Return to presentation library';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await options.save(); options.open(); }
    catch (error) { options.error(error instanceof Error ? error.message : String(error)); }
    finally { button.disabled = false; }
  });
  return button;
}
