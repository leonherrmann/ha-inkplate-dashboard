// The toolbar's switch between a page's two arrangements, as the checks drive
// it. It was a select until 2026.9 and is a two-button segment now; this keeps
// the select's vocabulary -- selectOption, inputValue -- so a check reads the
// same either way.
export function arrangement(page) {
  const group = page.getByRole("group", { name: "Arrangement" });
  const button = (which) =>
    group.getByRole("button", { name: which === "portrait" ? /^Sideways/ : /^Upright/ });
  return {
    count: () => group.count(),
    selectOption: (which) => button(which).click(),
    inputValue: async () =>
      (await button("portrait").getAttribute("aria-pressed")) === "true" ? "portrait" : "landscape",
    label: async () => (await group.locator("button.active").innerText()).trim(),
  };
}
