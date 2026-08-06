export function toggleExclusiveClass(
  element: HTMLElement,
  classes: readonly string[],
  desiredClass: string,
): void {
  classes.forEach((className) => {
    if (className !== desiredClass && element.classList.contains(className)) {
      element.classList.remove(className);
    }
  });
  if (!element.classList.contains(desiredClass))
    element.classList.add(desiredClass);
}
