# Interface joueur

La TASK 07 raccorde le parcours mobile aux services serveur livrés dans les tâches précédentes. La route principale d’un événement est `/play/:eventSlug`.

## Parcours couvert

L’interface gère les états suivants :

1. restauration du joueur depuis son cookie `HttpOnly` ;
2. inscription par pseudo lorsqu’aucune session valide n’existe ;
3. lobby et attente d’une session ;
4. affichage d’une question ouverte et de son chronomètre informatif ;
5. enregistrement irréversible de la première réponse ;
6. attente pendant la fermeture ;
7. révélation de la correction, de l’explication et des points ;
8. annulation d’une question sans points ;
9. accès au classement général ou à celui de la session active.

Le timer du navigateur améliore seulement l’affichage : l’heure serveur et `closes_at` restent l’autorité pour accepter ou refuser une réponse.

## Synchronisation

Le client interroge périodiquement :

- `GET /api/events/:eventSlug/state` pour découvrir la session active et son occurrence courante ;
- `GET /api/sessions/:id/current-question` pour obtenir le DTO public de la question ;
- `GET /api/session-questions/:id/result` pour restaurer l’état personnel et récupérer le résultat après révélation.

Le délai de polling varie entre 2,2 et 3,2 secondes afin de répartir les requêtes des téléphones. Toutes les réponses sont `no-store`. Le polling ne transporte jamais la bonne option ou l’explication avant `REVEALED`.

## Design et accessibilité

Le système visuel utilise uniquement les variables définies dans `src/app/globals.css`. Il privilégie :

- une mise en page utilisable dès 320 px et optimisée autour de 360–393 px ;
- des zones de réponse d’au moins 64 px de haut ;
- un focus clavier visible ;
- un choix signalé par la forme, la bordure et une icône, pas seulement par la couleur ;
- un mode `prefers-reduced-motion` ;
- aucun asset vidéo ni bibliothèque d’interface lourde.

## Tests

Les fonctions de temps, de difficulté, de formatage et de jitter sont testées unitairement. Les tests Playwright mobile couvrent la landing, l’inscription, le lobby, la réponse et l’absence de correction avant le changement d’état serveur vers `REVEALED`.
