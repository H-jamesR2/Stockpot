import type { RecipeDetail } from '@stockpot/shared';

/** Recipes are stored as rows. Retrieval works on text, so render each one as a small Markdown page. */
export function renderRecipe(recipe: RecipeDetail): string {
  const facts = [
    `Serves ${recipe.servings}.`,
    recipe.totalMin !== null ? `Total time ${recipe.totalMin} minutes.` : null,
    recipe.cuisine ? `Cuisine: ${recipe.cuisine}.` : null,
    recipe.methods.length > 0 ? `Methods: ${recipe.methods.join(', ').replaceAll('_', ' ')}.` : null,
  ].filter(Boolean);

  const parts = [`# ${recipe.title}`];
  if (recipe.description) parts.push(recipe.description);
  parts.push(facts.join(' '));
  parts.push('## Ingredients', recipe.ingredients.map((line) => `- ${line.rawText}`).join('\n'));
  parts.push('## Steps', recipe.steps.map((step) => `${step.stepNumber}. ${step.text}`).join('\n'));
  if (recipe.source) parts.push(`Source: ${recipe.source}`);
  return parts.join('\n\n') + '\n';
}
