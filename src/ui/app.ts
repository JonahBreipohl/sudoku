// Placeholder shell. Replaced by the grid UI tasks in milestone M3.
export function mountApp(root: HTMLElement): void {
  const heading = document.createElement("h1");
  heading.textContent = "Sudoku";
  root.replaceChildren(heading);
}
