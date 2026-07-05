import { useEffect } from "react";

// Gère le <title> et la balise <meta name="description"> par page, sans
// dépendance supplémentaire (pas de react-helmet) — cohérent avec le reste
// du projet qui évite les librairies quand une solution simple suffit.
// Nécessaire car index.html est unique (SPA) : sans ça, toutes les pages
// partageraient le même titre/la même description dans les résultats de
// recherche et les aperçus de partage.
export function useDocumentMeta(title, description) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} — Agile Toolbox` : "Agile Toolbox — Outils gratuits pour vos cérémonies Agile";

    let tag = document.querySelector('meta[name="description"]');
    const previousContent = tag?.getAttribute("content");
    if (description) {
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }

    // En quittant la page, on remet ce qui était affiché avant (utile si
    // jamais une page ne définit pas ses propres meta et hérite de celles
    // de la précédente le temps du prochain rendu).
    return () => {
      document.title = previousTitle;
      if (tag && previousContent != null) tag.setAttribute("content", previousContent);
    };
  }, [title, description]);
}
