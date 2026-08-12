# Bibliothèque de questions

La TASK 04 fournit la couche serveur de gestion des catégories et des questions. Elle reste interne jusqu’à la TASK 09, qui ajoutera l’authentification et le dashboard administrateur. Aucune route publique ne doit renvoyer `isCorrect`, l’explication ou les sources avant la phase de révélation prévue par le moteur de session.

## Modèle et règles

Une question accepte le texte, l’image optionnelle, la catégorie, la difficulté de 1 à 4, au maximum quatre propositions, l’explication et jusqu’à dix sources. Une question image exige une URL ; une question texte n’en conserve aucune. Les labels `A` à `D` et les identifiants sont attribués par le service serveur.

Un brouillon peut être incomplet afin de permettre une saisie progressive. Le passage en revue puis la validation exigent atomiquement :

- deux à quatre propositions ;
- exactement une bonne réponse ;
- au moins une source ;
- une catégorie active lors de la validation finale.

Le cycle autorisé est :

```text
DRAFT → REVIEW → VALIDATED → ARCHIVED
```

Toute édition d’un brouillon ou d’une question en revue la replace en `DRAFT`. Une question validée ou archivée n’est plus éditable. La duplication crée toujours un nouveau brouillon et conserve l’identifiant de la question source dans l’audit. Seules les questions `VALIDATED` pourront être sélectionnées par le moteur de session de la TASK 05.

## Architecture serveur

- `src/lib/validation/question-library.ts` valide les entrées et filtres internes avec Zod ;
- `src/server/services/question-library.ts` porte les règles métier et les transitions ;
- `src/server/repositories/question-library-repository.ts` exécute les écritures atomiques sur PostgreSQL/Neon et produit les audits.

Les mutations atomiques utilisent l’API batch du pilote HTTP Neon. Les erreurs de contrainte PostgreSQL sont converties en erreurs métier sans exposer les détails de connexion.

## Vérification

Les tests unitaires couvrent la validation, la normalisation des catégories, la préparation des options, la duplication et les erreurs de transition. Le workflow de PR exécute en plus le cycle complet sur la branche Neon éphémère après les migrations. Ce test est volontairement bloqué hors de `pull_request` avec `DATABASE_INTEGRATION_TARGET=neon-preview` afin d’éviter toute écriture accidentelle sur une autre base.
