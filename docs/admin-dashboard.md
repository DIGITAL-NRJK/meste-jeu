# Authentification et dashboard administrateur

La TASK 09 protège l’espace `/admin` et fournit la table de supervision de l’événement. La TASK 10 complète cet écran avec les commandes de conduite de la session live.

## Authentification

`POST /api/admin/login` accepte une adresse email et un mot de passe. Le mot de passe est comparé côté serveur à un hash `scrypt` salé ; ni le mot de passe, ni son hash, ni le token de session ne sont renvoyés dans le JSON ou écrits dans les logs.

Après une connexion valide, le navigateur reçoit le cookie `meste_admin_session` configuré avec `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` en production et une expiration de douze heures. PostgreSQL ne conserve que l’empreinte HMAC-SHA-256 du token calculée avec `ADMIN_AUTH_SECRET`. Une nouvelle connexion révoque les autres sessions actives du même administrateur.

Cinq mots de passe incorrects verrouillent le compte pendant quinze minutes. Le message public reste identique pour une adresse inconnue, un mot de passe incorrect, un compte désactivé ou un compte temporairement verrouillé.

`POST /api/admin/logout` révoque la session en base et efface le cookie. Chaque page et chaque API protégée refait l’autorisation côté serveur ; l’absence d’un lien public vers `/admin` ne constitue pas la protection.

## Création du premier administrateur

Après application des migrations sur la base ciblée, lancer la commande dans un terminal interactif :

```bash
npm run admin:create -- --email regie@example.com --name "Régie MESTE"
```

Le mot de passe et sa confirmation sont demandés sans être affichés. La commande exige au moins douze caractères avec une lettre, un chiffre et un caractère spécial. Elle refuse d’écraser un compte existant.

Cette commande écrit dans la base définie par `DATABASE_URL_UNPOOLED`, ou `DATABASE_URL` à défaut. Il faut donc toujours vérifier la cible avant de l’exécuter ; elle ne doit jamais être lancée automatiquement par la CI ou pendant un build Netlify.

## Dashboard

Le dashboard sélectionne en priorité un événement `LIVE`, puis `READY`, `DRAFT` ou le plus récent terminé. L’administrateur peut changer d’événement depuis l’interface.

Il affiche :

- le nombre total de participants et les participants actifs durant les quinze dernières minutes ;
- la session courante, son statut et son nombre de questions ;
- la question courante, son statut et le temps restant calculé depuis l’heure serveur ;
- les réponses reçues, les bonnes réponses, le taux de réussite et le temps moyen ;
- le Top 10 calculé depuis les événements de score actifs ;
- la répartition de la bibliothèque entre brouillons, revue et questions validées.

`GET /api/admin/dashboard` exige une session administrateur valide et utilise `Cache-Control: no-store`. L’écran se rafraîchit toutes les cinq à sept secondes avec un jitter léger. Les données déjà affichées restent visibles si une actualisation échoue.

La zone « Conduite live » propose l’action principale compatible avec l’état courant, ainsi que les actions critiques disponibles. Chaque commande demande une confirmation, passe par `POST /api/admin/live-control`, puis force une actualisation du dashboard. Les transitions, refus et écritures d’audit restent sous l’autorité du moteur serveur. Le contrat complet est décrit dans `docs/live-control.md`.

La zone « Exports CSV » génère les fichiers joueurs, classement et réponses pour l’événement sélectionné. Le journal administrateur expose les trente dernières actions globales sans leurs métadonnées internes. Le contrat d’encodage, de sécurité et de calcul est décrit dans `docs/admin-reporting.md`.

## Validation PostgreSQL

Le test d’intégration de PR crée un administrateur, un événement isolé, une session, une question, des participants, une réponse et un score. Il vérifie la connexion, les agrégats du dashboard, la révocation de session et le verrouillage après cinq échecs. Comme les autres tests PostgreSQL, il est bloqué hors de la branche Neon éphémère associée à une Pull Request.
