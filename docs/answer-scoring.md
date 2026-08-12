# Réponse et scoring

La TASK 06 fournit l’opération serveur d’enregistrement d’une réponse, le calcul du score et le ledger associé. L’interface mobile sera raccordée en TASK 07 et le classement agrégé en TASK 08.

## Contrat joueur

`POST /api/session-questions/:id/answer` exige le cookie de session joueur et un corps JSON :

```json
{ "optionId": "uuid" }
```

La réponse `201` confirme uniquement l’identifiant de la réponse, l’heure serveur de réception et le temps de réponse. Elle ne contient jamais la correction, l’explication ou les points.

Le serveur refuse notamment :

- une occurrence absente ou appartenant à un autre événement ;
- une occurrence non ouverte, expirée ou annulée ;
- une proposition qui n’appartient pas à la question ;
- toute réponse postérieure à la première.

`GET /api/session-questions/:id/result` expose seulement le statut et la présence d’une réponse pendant `PENDING`, `OPEN` et `CLOSED`. À partir de `REVEALED`, il ajoute la proposition choisie, la bonne proposition, l’explication et le détail du score. Une occurrence `CANCELED` retourne toujours un total de zéro.

Toutes les réponses portent `Cache-Control: no-store`.

## Calcul

Une bonne réponse produit 100 points, puis les bonus suivants :

| Niveau de difficulté | Bonus |
|---|---:|
| Découverte (1) | 0 |
| Connaisseur (2) | 20 |
| Expert (3) | 40 |
| Maître du Congo (4) | 60 |

Le bonus de rapidité est calculé avec l’heure de réception serveur :

```text
floor(30 × temps restant / durée totale)
```

Il est borné entre 0 et 30. Les seuils de série ajoutent 20 points à 3 bonnes réponses, 30 à 5 et 50 à 8. Le bonus est attribué uniquement lorsque le seuil est atteint ; une mauvaise réponse vaut zéro et remet la série à zéro.

## Atomicité et audit

Le repository PostgreSQL réalise dans une seule instruction cohérente l’authentification, les contrôles temporels, l’insertion de la réponse, la mise à jour de la série et l’écriture des événements `ANSWER_CORRECT`, `DIFFICULTY_BONUS`, `SPEED_BONUS` et `STREAK_BONUS`.

La contrainte unique `(player_id, session_question_id)` reste l’autorité anti-double réponse en cas de concurrence entre plusieurs instances serveur. Lorsqu’une occurrence est annulée, ses réponses sont conservées et tous ses événements de score actifs reçoivent `voided_at`. Aucun historique n’est supprimé.

## Tests PostgreSQL

Le workflow de PR exécute le test d’intégration uniquement sur la branche Neon éphémère. Il vérifie le calcul complet, l’absence de révélation anticipée, le doublon concurrent, la remise à zéro de série, le refus à l’échéance et l’invalidation des scores après annulation.
