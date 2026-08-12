# Exports et journal d’audit

La TASK 11 ajoute à la régie les trois exports CSV exigés par la V1 et la consultation rapide des dernières actions administratives.

## Exports CSV

Les administrateurs authentifiés peuvent générer, pour l’événement sélectionné :

- `GET /api/admin/exports/players?eventSlug=…` : joueurs, statut, série et dates d’activité ;
- `GET /api/admin/exports/leaderboard?eventSlug=…` : classement complet des joueurs actifs et total des scores non invalidés ;
- `GET /api/admin/exports/answers?eventSlug=…` : session, question, joueur, réponse choisie, correction et temps de réponse. La bonne réponse et le résultat restent vides tant que l’occurrence n’est pas `REVEALED`.

Chaque requête vérifie la session administrateur avant toute lecture métier. Un événement ne peut être sélectionné que par un slug validé, et les requêtes PostgreSQL appliquent systématiquement son identifiant comme périmètre.

Les fichiers utilisent UTF-8 avec BOM, des fins de ligne CRLF et le séparateur `;`. Cette combinaison préserve les accents et facilite l’ouverture dans Excel en locale française comme dans Google Sheets. Les cellules textuelles commençant par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot sont préfixées par une apostrophe afin de neutraliser l’injection de formule.

Les réponses portent `Cache-Control: no-store`, `Content-Type: text/csv; charset=utf-8`, `X-Content-Type-Options: nosniff` et un nom de pièce jointe dérivé du slug validé. Aucun token, hash de session ou mot de passe n’est exporté.

## Journal d’audit

`GET /api/admin/audit-logs?limit=30` retourne les dernières actions globales, de la plus récente à la plus ancienne. La limite vaut 30 par défaut et reste comprise entre 1 et 100.

Le payload public de régie contient uniquement :

- l’action ;
- le type et l’identifiant de l’entité ;
- le nom affiché de l’administrateur, ou « Système » ;
- l’horodatage UTC.

Les métadonnées internes ne sont pas envoyées à l’interface. La régie charge les trente dernières lignes côté serveur, puis rafraîchit l’historique après une commande live réussie.

Les journaux restent immuables : l’export et la consultation sont en lecture seule, et aucune route de suppression ou de modification n’est exposée.

## Classement exporté

Le calcul reprend les règles du classement public :

- seuls les joueurs `ACTIVE` sont classés ;
- seuls les événements de score dont `voided_at` est nul sont additionnés ;
- les joueurs sans score restent présents avec zéro point ;
- `rank()` conserve les égalités ;
- l’ordre d’affichage est stabilisé par le pseudo puis le code public.

## Validation PostgreSQL

Le test d’intégration de PR vérifie les trois requêtes d’export, les scores actifs, la réponse choisie et la lecture d’un audit associé à son administrateur. Comme les autres tests PostgreSQL, il s’exécute uniquement sur la branche Neon éphémère liée à la Pull Request.
