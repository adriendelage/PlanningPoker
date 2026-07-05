import { useDocumentMeta } from "../useDocumentMeta";

// Template de base — à relire et compléter (Claude n'est pas juriste).
// Notamment : remplacer [CONTACT] par une vraie adresse de contact, et
// mettre à jour cette page si de la publicité ou de la mesure d'audience
// est ajoutée un jour (voir la note dans cookieConsent.js).
export default function PrivacyPolicy() {
  useDocumentMeta("Politique de confidentialité", "Politique de confidentialité d'Agile Toolbox : données collectées, cookies, droits RGPD.");

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#ccc", padding: "40px 16px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", lineHeight: 1.7 }}>

        <a href="/" style={{ display: "inline-block", color: "#666", fontSize: 14, textDecoration: "none", marginBottom: 24 }}>
          ← Retour aux outils
        </a>

        <h1 style={{ color: "#fff", fontSize: 28 }}>Politique de confidentialité</h1>
        <p style={{ color: "#666", fontSize: 13 }}>Dernière mise à jour : juillet 2026</p>

        <h2 style={{ color: "#fff", fontSize: 19, marginTop: 32 }}>Qui sommes-nous</h2>
        <p>
          Agile Toolbox est un ensemble d'outils gratuits pour les cérémonies
          Agile, édité par Mr1Dridri. Pour toute question relative à cette
          politique ou à tes données, contacte [CONTACT].
        </p>

        <h2 style={{ color: "#fff", fontSize: 19, marginTop: 32 }}>Données collectées</h2>
        <p><strong style={{ color: "#ddd" }}>En mode « lien » (Planning Poker, Rétrospective, Kanban, etc.) :</strong></p>
        <ul>
          <li>Les noms/prénoms que tu saisis pour rejoindre une session ne sont transmis qu'aux autres participants de cette session, en temps réel — jamais stockés de façon identifiable au-delà de la durée de la session.</li>
          <li>Un historique de tes propres sessions créées/rejointes est conservé <strong>uniquement dans ton navigateur</strong> (localStorage), jamais envoyé à nos serveurs.</li>
          <li>Le contenu des outils permanents (Kanban, Vélocité, OKR, etc.) est conservé en base de données pour que le tableau reste accessible via son lien.</li>
        </ul>
        <p><strong style={{ color: "#ddd" }}>En mode « espace de travail connecté » (comptes) :</strong></p>
        <ul>
          <li>Nom, adresse email et mot de passe (celui-ci est hashé — jamais stocké ni consultable en clair) lors de la création d'un compte.</li>
          <li>Le contenu que tu crées dans ton organisation (tâches, commentaires, sprints) est stocké en base de données, accessible uniquement aux membres de ton organisation.</li>
        </ul>

        <h2 style={{ color: "#fff", fontSize: 19, marginTop: 32 }}>Cookies et stockage local</h2>
        <p>
          Le site utilise le stockage local du navigateur (localStorage) et,
          pour l'espace de travail connecté, un jeton de connexion — tous deux
          strictement nécessaires au fonctionnement du site. À ce jour, aucun
          cookie publicitaire ni de mesure d'audience n'est utilisé. Si cela
          change, cette page sera mise à jour et ton consentement sera demandé
          au préalable.
        </p>

        <h2 style={{ color: "#fff", fontSize: 19, marginTop: 32 }}>Tes droits</h2>
        <p>
          Conformément au RGPD, tu disposes d'un droit d'accès, de
          rectification et de suppression de tes données. Pour l'exercer,
          contacte [CONTACT]. Tu peux aussi supprimer ton historique local
          à tout moment en vidant les données de ton navigateur pour ce site.
        </p>

        <h2 style={{ color: "#fff", fontSize: 19, marginTop: 32 }}>Hébergement</h2>
        <p>
          Le site (frontend) est hébergé par Netlify et le serveur/la base de
          données par Railway. Ces prestataires peuvent traiter des données
          techniques (adresse IP, journaux de connexion) dans le cadre de
          leur propre politique de confidentialité.
        </p>

      </div>
    </div>
  );
}
