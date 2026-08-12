# Contrôle live

La TASK 10 raccorde la régie `/admin` au moteur de session existant. Le navigateur ne décide jamais d’une transition : il demande une commande et PostgreSQL arbitre atomiquement l’état réellement courant.

## Commandes de la régie

La zone « Conduite live » adapte son action principale à la session et à la question affichées :

- `DRAFT` : préparer la session ;
- `READY` : lancer la session ;
- `LIVE` sans question active : lancer la question suivante ;
- question `OPEN` : fermer les réponses ;
- question `CLOSED` : révéler la réponse ;
- question `REVEALED` : lancer la suivante ;
- question déjà jouée : l’annuler et invalider ses scores ;
- session `LIVE` : la terminer une fois toutes les occurrences révélées ou annulées.

Toutes les commandes demandent une confirmation simple. Les actions d’annulation et de fin utilisent un traitement visuel distinct afin d’éviter une activation accidentelle.

## API protégée

`POST /api/admin/live-control` exige le cookie de session administrateur valide et accepte un corps JSON :

```json
{
  "action": "CLOSE_CURRENT_QUESTION",
  "sessionId": "00000000-0000-4000-8000-000000000000"
}
```

L’annulation exige aussi `sessionQuestionId`. L’occurrence doit appartenir à la session fournie. Le schéma refuse les propriétés inconnues et les identifiants non UUID.

La réponse utilise `Cache-Control: no-store`. Les statuts publics sont :

- `200` : transition effectuée et session mise à jour ;
- `400` : JSON ou commande invalide ;
- `401` : session administrateur absente ou expirée ;
- `404` : session introuvable ;
- `409` : transition refusée car l’état a changé ou ne la permet pas ;
- `500` : erreur serveur non détaillée au client.

## Autorité serveur et audit

Les services réutilisent les transitions atomiques du moteur de session. Une requête concurrente ou répétée ne peut donc pas ouvrir deux questions, révéler une question encore ouverte ou terminer une session avec des occurrences non résolues.

Les actions `SESSION_STARTED`, `QUESTION_STARTED`, `QUESTION_CLOSED`, `QUESTION_REVEALED`, `QUESTION_CANCELED` et `SESSION_FINISHED` sont écrites par le moteur dans les journaux d’audit avec l’identifiant de l’administrateur. Une question annulée conserve ses réponses et invalide ses événements de score, sans supprimer l’historique.

La bonne réponse et l’explication ne transitent jamais par ce nouvel endpoint. Le DTO joueur continue de ne les exposer qu’après l’état `REVEALED`.

## Validation

Les tests unitaires couvrent la sélection des actions, le dispatch serveur, la cohérence session-occurrence et la protection de la route. Le test d’intégration PostgreSQL du moteur couvre le cycle complet et les refus atomiques sur la branche Neon éphémère de la Pull Request.
