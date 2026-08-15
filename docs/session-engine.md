# Moteur de session

La TASK 05 fournit le moteur serveur des sessions de quiz. Les routes joueur et l’interface mobile sont raccordées depuis la TASK 07, le dashboard et les commandes opérateur depuis les TASK 09 et 10, puis la création des événements, des sessions et de leur conducteur depuis la TASK 14.

## Cycle d’une session

Une session est créée en `DRAFT`. Sa configuration ordonnée peut alors être remplacée librement avec une durée positive par occurrence. Seules des questions `VALIDATED` peuvent être ajoutées.

```text
DRAFT → READY → LIVE → FINISHED
```

Le passage en `READY` et le démarrage revalident qu’au moins une question est configurée et que toutes les questions sont encore validées. Le démarrage et la fin utilisent l’heure du serveur et produisent respectivement les audits `SESSION_STARTED` et `SESSION_FINISHED`.

L’interface `/admin/sessions` conserve le conducteur en `DRAFT` tant que l’ordre et les durées restent modifiables. Elle ne propose que les questions `VALIDATED`. Une fois la session rendue `READY`, le conducteur devient non modifiable et l’événement peut passer de `DRAFT` à `READY` pour ouvrir les inscriptions joueur.

## Réouverture du conducteur

Une session `READY` qui n’a jamais été lancée peut revenir en `DRAFT` depuis la régie, afin de corriger son conducteur après une répétition. La commande `RESET_SESSION_DRAFT` est refusée dès qu’une trace de jeu existe :

- au moins une occurrence possède un `opens_at` ;
- au moins une réponse est enregistrée sur une de ses occurrences ;
- au moins un événement de score référence la session.

Ces trois conditions sont évaluées par PostgreSQL dans la même requête que la transition, et non en amont par le service : une session déjà jouée reste donc verrouillée même si son statut a été ramené à `READY` par la réinitialisation d’un événement. La transition écrit un audit `SESSION_RESET_DRAFT`. Les réponses, les scores et le journal ne sont jamais supprimés.

## Cycle d’une occurrence

```text
PENDING → OPEN → CLOSED → REVEALED
                    ↘
                     CANCELED
```

Le moteur ouvre toujours la première occurrence `PENDING` selon sa position. Une ouverture définit `opens_at` et calcule `closes_at` depuis la durée enregistrée. Une nouvelle question ne peut pas être ouverte tant que la précédente est `OPEN` ou `CLOSED`.

Une occurrence peut être annulée pendant une session `LIVE`, ou après sa fin pour préserver le cas d’une question déjà jouée. Les réponses restent conservées et tous les événements de score actifs associés sont invalidés par `voided_at` dans la même opération serveur.

PostgreSQL garantit par un index unique partiel qu’une session ne possède jamais deux occurrences `OPEN`, y compris lorsque deux commandes concurrentes arrivent sur des instances serveur différentes.

## Données joueur

Le DTO public est construit dans la couche d’accès aux données et ne contient jamais `isCorrect`, les sources ni l’explication avant la révélation. Avant `REVEALED`, il expose uniquement :

- l’état et les horaires de la session ;
- le texte, la catégorie, la difficulté et le média ;
- les propositions sans indicateur de correction ;
- `acceptingAnswers`, calculé avec l’heure serveur et `closes_at`.

Au statut `REVEALED`, le DTO ajoute explicitement la bonne option et l’explication. Le repository est marqué `server-only` afin d’empêcher son import dans un composant client.

## Architecture

- `src/lib/validation/session-engine.ts` valide la création et la configuration ;
- `src/server/services/session-engine.ts` porte les règles métier et les erreurs ;
- `src/server/repositories/session-engine-repository.ts` exécute les transitions atomiques et fabrique le DTO public minimal ;
- `db/migrations/0001_absent_talos.sql` ajoute la garantie d’une seule question ouverte.

Le workflow de PR applique la migration avec la connexion Neon directe, puis exécute le cycle complet sur la branche éphémère : configuration, démarrage, ouverture, fermeture, révélation, annulation et fin. Le test vérifie aussi la contrainte concurrente et l’absence de bonne réponse dans les données pré-révélation.
