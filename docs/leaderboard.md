# Classement

La TASK 08 fournit le classement public de l’événement, le classement d’une session, le Top 10 et la position individuelle du joueur reconnu.

## Endpoint

`GET /api/leaderboard` accepte :

- `eventSlug`, obligatoire ;
- `sessionId`, facultatif, pour limiter le calcul à une session de cet événement.

Le classement reste consultable sans authentification. Lorsqu’un cookie joueur valide est présent pour l’événement demandé, le DTO ajoute sa position, y compris lorsqu’elle se situe en dehors du Top 10. Le token brut et les identifiants internes des joueurs ne sont jamais exposés.

La réponse utilise `Cache-Control: no-store`. L’écran `/leaderboard/:eventSlug` la rafraîchit toutes les 5 à 7 secondes avec un jitter afin d’éviter des requêtes simultanées depuis tous les téléphones.

## Calcul

Le total est toujours recalculé depuis la somme des événements `score_events` dont `voided_at` est nul :

- le classement général additionne toutes les sessions de l’événement ;
- le classement de session limite la somme à `quiz_session_id` ;
- les joueurs `DISABLED` sont exclus ;
- un participant à une session reste classé à zéro si tous ses événements ont été invalidés ;
- une mauvaise réponse sans événement de score compte comme participation grâce à la réponse conservée.

Aucune colonne de score agrégé n’est maintenue. L’annulation d’une question ou une future correction administrative est donc visible au prochain calcul.

## Égalités

PostgreSQL applique `RANK()` sur le total décroissant. Deux joueurs avec le même total partagent la même position, et le rang suivant conserve l’écart correspondant. L’ordre visuel entre joueurs à égalité est stabilisé par le pseudo insensible à la casse puis le code public ; cet ordre n’altère pas leur position.

## Interface

La table d’honneur affiche au maximum dix joueurs et permet de basculer entre l’événement et la session active. La ligne du joueur courant est mise en évidence. S’il est hors du Top 10, un encart distinct affiche sa position et son score sans modifier la liste publique.

Le design reste volontairement sobre : les trois premiers rangs reçoivent seulement un traitement doré discret, sans podium animé ni esthétique enfantine.

## Tests

Les tests unitaires couvrent la validation, le Top 10, l’accès public et l’identification optionnelle. Le test PostgreSQL de PR vérifie les deux portées, les égalités, la position personnelle, l’exclusion des joueurs désactivés et le recalcul après invalidation. Playwright vérifie le Top 10, le rang hors liste et le changement de portée sur mobile.
