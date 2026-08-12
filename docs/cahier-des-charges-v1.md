# CAHIER DES CHARGES FONCTIONNEL ET TECHNIQUE

<!-- Document de référence canonique du projet. -->

## MESTE — Héritage Congo Quiz

**Version :** V1.0  
**Date :** 12 août 2026  
**Date impérative de lancement :** 15 août 2026  
**Événement :** Fête de l’Indépendance de la République du Congo au Ghana  
**Organisateur de la réception :** Consulat / Consul du Congo au Ghana  
**Marque :** Mama Emma Service Traiteur d’Excellence — MESTE

---

# 1. Objet du projet

Développer une application web mobile-first permettant d’organiser un quiz culturel interactif consacré à la **République du Congo — Congo-Brazzaville**.

Dans l’ensemble du projet :

- « Congo » désigne la République du Congo ;
- « RDC » désigne la République démocratique du Congo ;
- aucune confusion entre les deux pays ne doit apparaître dans le contenu, le code, les interfaces ou la base de questions.

L’application doit être utilisée en complément d’un groupe WhatsApp MESTE créé à l’occasion de la fête de l’Indépendance du Congo du 15 août 2026.

La V1 ne doit pas dépendre d’une automatisation directe du groupe WhatsApp.

Architecture générale retenue :

```text
GROUPE WHATSAPP MESTE
        │
        │ lien / QR code
        ▼
APPLICATION HÉRITAGE CONGO
        │
        ├── Espace joueur
        ├── Quiz
        ├── Scores
        ├── Classement
        └── Administration
        │
        ▼
BACKEND NEXT.JS
        │
        ▼
NEON POSTGRESQL
```

WhatsApp constitue le canal d’animation et d’acquisition.

L’application web constitue le moteur du jeu.

---

# 2. Objectifs

## 2.1 Objectifs événementiels

Le jeu doit :

- générer de l’engagement autour de l’événement ;
- valoriser la culture congolaise ;
- faire découvrir le Congo aux non-Congolais ;
- créer une dynamique communautaire ;
- renforcer la visibilité de MESTE ;
- permettre une compétition conviviale ;
- identifier des gagnants ;
- pouvoir être utilisé avant et pendant la réception.

## 2.2 Objectifs produit

Le moteur développé ne doit pas être jetable.

L’architecture devra permettre ultérieurement de créer :

- d’autres quiz MESTE ;
- des animations corporate ;
- des challenges de marque ;
- des jeux pour Mama Emma Fresh ;
- des animations de mariage ;
- des jeux pour The Mama Emma Experience ;
- des activations sponsorisées ;
- des quiz thématiques multi-événements.

La priorité absolue reste toutefois le lancement du 15 août 2026.

---

# 3. Principes de conception

La V1 doit respecter six principes.

### 3.1 Mobile-first

L’interface doit être conçue en priorité pour smartphone.

Elle doit fonctionner correctement à partir d’une largeur d’écran d’environ 360 px.

### 3.2 Friction minimale

Aucun compte classique avec email et mot de passe ne doit être nécessaire pour jouer.

Le parcours cible est :

```text
WhatsApp
→ lien
→ choix du pseudo
→ jouer
```

### 3.3 Serveur autoritaire

Le navigateur ne doit jamais décider :

- si une réponse est arrivée à temps ;
- si une réponse est correcte ;
- combien de points sont obtenus ;
- si une question est ouverte ou fermée.

Ces décisions appartiennent exclusivement au serveur.

### 3.4 Résilience

L’application doit rester simple.

Éviter pour la V1 :

- microservices ;
- architecture événementielle complexe ;
- WebSockets obligatoires ;
- infrastructure Redis obligatoire ;
- système de comptes sophistiqué ;
- dépendance critique à WhatsApp Cloud API.

### 3.5 Premium

Le produit doit correspondre à l’univers MESTE :

- élégant ;
- culturel ;
- contemporain ;
- premium ;
- lisible ;
- non enfantin.

### 3.6 Extensible

Le code doit être structuré pour permettre plusieurs événements et plusieurs sessions de quiz sans réécriture du moteur.

---

# 4. Nom de travail

Nom V1 :

# Héritage Congo

Signature possible :

**Héritage Congo — Le Quiz Culturel par MESTE**

Le nom doit être paramétrable afin de permettre ultérieurement d’utiliser le moteur avec d’autres marques ou événements.

---

# 5. Utilisateurs

La V1 comporte trois rôles fonctionnels.

## 5.1 Visiteur

Peut :

- accéder à la page d’accueil ;
- comprendre le principe du jeu ;
- s’inscrire ;
- consulter éventuellement le classement public.

## 5.2 Joueur

Peut :

- choisir un pseudo ;
- rejoindre une session ;
- répondre ;
- consulter le résultat d’une question après sa fermeture ;
- voir ses points ;
- voir sa progression ;
- consulter le classement.

## 5.3 Administrateur

Peut :

- gérer les questions ;
- gérer les catégories ;
- gérer les sessions ;
- gérer les participants ;
- lancer une question ;
- fermer une question ;
- annuler une question ;
- consulter les réponses ;
- consulter les scores ;
- ajuster un score ;
- voir le classement ;
- gérer les récompenses ;
- exporter les données.

---

# 6. Modes de jeu V1

Deux modes sont retenus.

## 6.1 Mode Découverte

Destiné principalement aux jours précédant l’événement.

Caractéristiques :

- rythme tranquille ;
- questions culturelles ;
- feedback pédagogique ;
- score ;
- progression ;
- pas nécessairement de forte pression liée au temps.

## 6.2 Mode Live

Destiné principalement au 15 août.

Caractéristiques :

- questions synchronisées ;
- temps limité ;
- classement ;
- bonus de rapidité ;
- streak ;
- animation WhatsApp parallèle ;
- possibilité de sélectionner des finalistes.

---

# 7. Parcours joueur

## 7.1 Étape 1 — Invitation

Le joueur reçoit dans WhatsApp :

- le nom du jeu ;
- une courte description ;
- un lien ;
- éventuellement un QR code.

Exemple de destination :

```text
quiz.meste.example/play
```

Le domaine réel sera défini lors du déploiement.

---

## 7.2 Étape 2 — Landing page

La page doit afficher :

- identité MESTE ;
- nom du jeu ;
- courte introduction ;
- bouton « Participer » ;
- éventuellement le nombre de participants.

Aucune longue explication.

---

## 7.3 Étape 3 — Inscription

Le joueur choisit un pseudo.

Contraintes recommandées :

- 3 à 20 caractères ;
- caractères offensants pouvant être modérés ;
- unicité du pseudo à l’intérieur de l’événement ;
- comparaison insensible à la casse.

Exemple :

```text
Votre nom de joueur

[ Khenny ]

[ ENTRER DANS LE JEU ]
```

---

# 8. Identification du joueur

La V1 ne nécessite pas obligatoirement :

- numéro WhatsApp ;
- email ;
- SMS OTP ;
- mot de passe.

Lors de l’inscription, le backend génère :

- un UUID interne ;
- un code joueur public ;
- un token de session sécurisé.

Exemple de code public :

```text
HC-0842
```

Le token de session doit être stocké dans un cookie sécurisé.

Le joueur doit rester reconnu lorsqu’il recharge la page.

---

# 9. Lobby

Après inscription :

```text
HÉRITAGE CONGO

Bienvenue Khenny

Score
1 240 pts

Position
#12

Prochaine session

Grand Quiz de l’Indépendance
Début : 18:30

[ EN ATTENTE ]
```

Lorsque la session commence, le joueur doit pouvoir rejoindre immédiatement le quiz.

---

# 10. Écran question

Structure recommandée :

```text
Question 07 / 15

HISTOIRE
Expert

────────────────

QUESTION

────────────────

A. ...
B. ...
C. ...
D. ...

Temps restant

00:32
```

Les boutons doivent être larges et facilement utilisables sur smartphone.

---

# 11. Validation d’une réponse

Une seule réponse par joueur et par occurrence de question.

Après sélection :

```text
Réponse enregistrée ✓
```

Le choix devient irréversible.

L’application ne révèle pas immédiatement la bonne réponse en mode Live.

---

# 12. Fermeture de la question

La fermeture est déterminée par le serveur.

Chaque occurrence possède :

- `opens_at`
- `closes_at`

Toute réponse reçue après `closes_at` doit être refusée, même si le navigateur du joueur affiche encore du temps.

---

# 13. Révélation

Après fermeture :

```text
Bonne réponse

B — ...

────────────────

Le saviez-vous ?

Explication culturelle courte.

────────────────

+142 points

Score total
1 382 pts
```

L’explication ne doit pas être transmise au navigateur avant la fermeture lorsque cela pourrait révéler la réponse.

---

# 14. Difficultés

Quatre niveaux :

1. Découverte
2. Connaisseur
3. Expert
4. Maître du Congo

Ces valeurs doivent être stockées indépendamment du libellé afin de permettre leur renommage ultérieur.

---

# 15. Scoring

## 15.1 Score de base

Bonne réponse :

**+100 points**

Mauvaise réponse :

**0 point**

Pas de pénalité négative dans la V1.

---

## 15.2 Difficulté

| Niveau | Bonus |
|---|---:|
| Découverte | +0 |
| Connaisseur | +20 |
| Expert | +40 |
| Maître du Congo | +60 |

---

## 15.3 Rapidité

Bonus maximum :

**+30 points**

Formule de référence :

```text
speed_bonus =
floor(
  max_bonus × remaining_time / total_question_time
)
```

avec :

```text
max_bonus = 30
```

Le temps est calculé à partir de l’heure de réception serveur.

---

# 16. Streak

Bonus proposés :

| Série | Bonus |
|---|---:|
| 3 bonnes réponses | +20 |
| 5 bonnes réponses | +30 |
| 8 bonnes réponses | +50 |

Une mauvaise réponse remet le compteur de série à zéro.

Ces bonus sont déclenchés au franchissement du seuil, pas à chaque question suivante.

---

# 17. Score final d’une question

Exemple :

Question Expert :

```text
Bonne réponse         100
Difficulté             40
Rapidité               22
────────────────────────
TOTAL                  162
```

Si le joueur atteint simultanément un streak de 3 :

```text
162 + 20 = 182 points
```

---

# 18. Finale

Les scores précédents servent à déterminer les qualifiés.

Pour la finale, prévoir une option permettant de :

```text
RESET FINAL SCORE = true
```

La compétition finale repart alors de zéro entre les finalistes.

Les scores de qualification restent conservés en historique.

---

# 19. Questions

Chaque question doit posséder au minimum :

- identifiant ;
- question ;
- catégorie ;
- difficulté ;
- quatre propositions maximum ;
- bonne réponse ;
- explication ;
- statut ;
- source ;
- date de validation.

---

# 20. Statuts d’une question

```text
DRAFT
REVIEW
VALIDATED
ARCHIVED
```

Seules les questions `VALIDATED` peuvent être ajoutées à une session publique.

---

# 21. Sources

Une question validée doit posséder au minimum une source.

Informations :

- organisme / auteur ;
- titre ;
- URL ;
- date de vérification ;
- commentaire éventuel.

Une question peut avoir plusieurs sources.

L’application d’administration doit bloquer la validation si aucune source n’est enregistrée.

---

# 22. Types de questions

## V1 obligatoire

- QCM texte ;
- QCM avec image.

## Post-V1

- audio ;
- vidéo ;
- réponse libre ;
- glisser-déposer ;
- géographie interactive ;
- association d’éléments.

---

# 23. Catégories

Le système doit permettre de créer librement les catégories.

Base initiale possible :

- Histoire ;
- Indépendance ;
- Géographie ;
- Brazzaville ;
- Villes et départements ;
- Culture ;
- Musique ;
- Danse ;
- Gastronomie ;
- Langues ;
- Littérature ;
- Arts ;
- Sport ;
- Nature ;
- Faune ;
- Tourisme ;
- Symboles ;
- Institutions ;
- Personnalités ;
- Économie ;
- Congo–Ghana ;
- Culture populaire ;
- Anecdotes.

---

# 24. Sessions

Une session représente un ensemble de questions jouées dans un contexte précis.

Exemples :

```text
Découverte — 13 août
Découverte — 14 août
Grand Quiz — 15 août
Finale — 15 août
```

Statuts :

```text
DRAFT
READY
LIVE
FINISHED
CANCELED
```

---

# 25. Occurrence de question

Une question de la bibliothèque n’est pas directement jouée.

Lorsqu’elle est ajoutée à une session, une `session_question` est créée.

Elle contient notamment :

- session ;
- question ;
- ordre ;
- durée ;
- ouverture ;
- fermeture ;
- statut ;
- multiplicateurs éventuels.

Cela permet de réutiliser une question dans plusieurs événements sans modifier la question originale.

---

# 26. Administration — Dashboard

Le dashboard principal affiche au minimum :

### Participants

- inscrits ;
- actifs récemment.

### Session

- session actuelle ;
- statut ;
- question actuelle ;
- temps restant.

### Question actuelle

- nombre de réponses ;
- nombre de bonnes réponses ;
- taux de réussite ;
- temps moyen.

### Classement

Top 10.

---

# 27. Commandes Live

L’administrateur doit pouvoir :

- lancer une session ;
- lancer une question ;
- fermer une question ;
- révéler une réponse ;
- passer à la suivante ;
- annuler une question ;
- terminer une session.

Toute action critique doit demander une confirmation simple lorsque l’erreur pourrait affecter les scores.

---

# 28. Gestion des questions

Interface permettant :

- création ;
- édition ;
- duplication ;
- ajout des réponses ;
- sélection de la bonne réponse ;
- ajout de l’explication ;
- ajout des sources ;
- catégorie ;
- difficulté ;
- média ;
- validation ;
- archivage.

---

# 29. Gestion des joueurs

L’administrateur peut :

- chercher un joueur ;
- consulter son score ;
- consulter ses réponses ;
- désactiver un joueur ;
- consulter son code public ;
- appliquer un ajustement de score.

---

# 30. Modification de score

Un score existant ne doit jamais être directement écrasé.

Toute correction produit un événement :

```text
ADMIN_ADJUSTMENT
```

avec :

- valeur ;
- raison ;
- administrateur ;
- date.

Exemple :

```text
-50 points
Motif : question annulée
```

---

# 31. Ledger des scores

Le score est calculé à partir d’événements.

Types minimum :

```text
ANSWER_CORRECT
DIFFICULTY_BONUS
SPEED_BONUS
STREAK_BONUS
ADMIN_ADJUSTMENT
```

Le classement correspond à la somme des événements actifs.

Cette approche permet l’audit complet des scores.

---

# 32. Annulation d’une question

Une question déjà jouée peut être annulée.

Dans ce cas :

- les réponses sont conservées ;
- l’occurrence devient `CANCELED` ;
- les événements de score associés sont invalidés ;
- le classement est recalculé.

Aucune donnée d’audit ne doit être supprimée.

---

# 33. Classements

La V1 doit supporter :

- classement général de l’événement ;
- classement d’une session ;
- Top 10 ;
- position individuelle.

Post-V1 :

- quotidien ;
- équipe ;
- catégorie ;
- sponsor ;
- département ;
- diaspora.

---

# 34. Écran classement

Design sobre.

Exemple :

```text
CLASSEMENT

1   Makaya       2 840
2   Nzambe       2 775
3   BrazzaBoy    2 630

4   ...
5   ...
```

Les médailles peuvent être utilisées avec retenue.

Éviter une esthétique enfantine ou excessivement gamifiée.

---

# 35. Récompenses

Prévoir les tables nécessaires pour :

- créer une récompense ;
- associer une récompense à un événement ;
- définir la position ou condition d’attribution ;
- attribuer la récompense à un joueur ;
- indiquer si elle a été remise.

La nature exacte des récompenses n’est pas imposée dans la V1.

---

# 36. Modèle de données

Tables principales :

```text
events
players
player_sessions

categories
questions
question_options
question_sources

quiz_sessions
session_questions

answers

score_events

rewards
reward_awards

admin_users
admin_sessions

consents
audit_logs
```

---

# 37. Table `events`

Champs indicatifs :

```text
id
slug
name
description
starts_at
ends_at
timezone
status
created_at
updated_at
```

---

# 38. Table `players`

```text
id
event_id
public_code
nickname
status
current_streak
created_at
updated_at
last_seen_at
```

Contrainte :

```text
UNIQUE(event_id, lower(nickname))
```

ou mécanisme équivalent.

---

# 39. Table `player_sessions`

```text
id
player_id
token_hash
created_at
expires_at
last_seen_at
revoked_at
```

Ne jamais stocker le token brut si une version hashée suffit.

---

# 40. Table `categories`

```text
id
name
slug
description
active
```

---

# 41. Table `questions`

```text
id
category_id
question_text
explanation
difficulty
status
media_type
media_url
created_at
updated_at
validated_at
validated_by
```

---

# 42. Table `question_options`

```text
id
question_id
label
text
is_correct
position
```

Une question V1 possède exactement une bonne réponse.

---

# 43. Table `question_sources`

```text
id
question_id
publisher
title
url
verified_at
notes
```

---

# 44. Table `quiz_sessions`

```text
id
event_id
name
slug
mode
status
starts_at
ends_at
reset_score
created_at
updated_at
```

---

# 45. Table `session_questions`

```text
id
quiz_session_id
question_id
position
duration_seconds
status
opens_at
closes_at
revealed_at
canceled_at
```

---

# 46. Table `answers`

```text
id
player_id
session_question_id
question_option_id
received_at
response_time_ms
is_correct
created_at
```

Contrainte impérative :

```text
UNIQUE(player_id, session_question_id)
```

Cette contrainte doit exister directement en PostgreSQL et pas uniquement dans le code applicatif.

---

# 47. Table `score_events`

```text
id
player_id
quiz_session_id
session_question_id
type
points
metadata
created_at
voided_at
created_by_admin_id
```

---

# 48. Anti-triche V1

Le système doit empêcher ou limiter :

### Réponse multiple

Protection par contrainte PostgreSQL.

### Réponse tardive

Validation côté serveur.

### Modification

Aucun endpoint permettant de modifier une réponse joueur.

### Extraction anticipée de la réponse

La bonne réponse et l’explication ne doivent pas être présentes dans le payload joueur avant révélation.

### Spam

Rate limiting sur les endpoints sensibles.

### Manipulation du score

Scores calculés exclusivement côté serveur.

### Administration

Toutes les corrections manuelles sont journalisées.

---

# 49. Randomisation

La V1 peut permettre de mélanger l’ordre des réponses.

La correspondance avec la bonne réponse doit rester gérée par identifiant et jamais par lettre A/B/C/D codée en dur.

---

# 50. Authentification administrateur

L’espace `/admin` doit être protégé.

La V1 doit supporter au minimum :

- email / identifiant ;
- mot de passe sécurisé ;
- session sécurisée ;
- déconnexion.

Les mots de passe doivent être hashés.

Aucune clé d’administration ne doit être exposée au navigateur.

---

# 51. Architecture technique

Stack retenue :

```text
Frontend / Backend
Next.js
TypeScript

UI
React
CSS / Tailwind CSS

Database
Neon PostgreSQL

ORM / migrations
Drizzle ORM

Hosting
Netlify

Source control
GitHub
```

Next.js App Router est utilisé comme architecture principale.

---

# 52. Architecture applicative

Un seul projet Next.js.

Exemple :

```text
src/
  app/
    (public)/
    play/
    leaderboard/
    admin/
    api/

  components/
    player/
    admin/
    game/
    ui/

  lib/
    auth/
    db/
    game/
    scoring/
    security/
    validation/

  server/
    services/
    repositories/

db/
  schema/
  migrations/

tests/

docs/
```

Éviter de créer plusieurs applications ou services pour la V1.

---

# 53. Organisation métier

La logique métier ne doit pas être directement placée dans les composants React.

Exemple :

```text
lib/game/scoring.ts
lib/game/timing.ts
lib/game/streak.ts
```

ou organisation équivalente.

Les fonctions de scoring doivent être testables indépendamment de l’interface.

---

# 54. Endpoints joueur

Minimum recommandé :

```text
POST /api/register

GET /api/me

GET /api/events/:eventSlug/state

GET /api/sessions/:sessionId/current-question

POST /api/session-questions/:id/answer

GET /api/session-questions/:id/result

GET /api/leaderboard
```

Les chemins exacts peuvent être adaptés tant que les responsabilités restent claires.

---

# 55. Endpoint réponse

`POST /answer` doit effectuer dans une opération serveur cohérente :

1. authentifier le joueur ;
2. identifier la question ;
3. vérifier qu’elle est ouverte ;
4. vérifier la date serveur ;
5. vérifier que l’option appartient à la question ;
6. enregistrer la réponse ;
7. calculer le résultat ;
8. générer les événements de score ;
9. mettre à jour le streak ;
10. empêcher une seconde réponse.

Les opérations critiques doivent être transactionnelles.

---

# 56. Temps

Tous les timestamps doivent être stockés en UTC.

L’affichage de l’événement doit utiliser le fuseau horaire configuré pour l’événement.

Le timer visuel peut fonctionner dans le navigateur mais le serveur reste l’autorité.

---

# 57. Synchronisation Live

Pour la V1, ne pas implémenter de WebSocket si ce n’est pas indispensable.

Le client peut interroger périodiquement un endpoint léger donnant uniquement :

```text
session_status
current_question_id
opens_at
closes_at
revealed_at
```

Les réponses spécifiques au joueur doivent rester non mises en cache publiquement.

L’intervalle doit comporter un léger jitter afin d’éviter que tous les clients interrogent le serveur exactement au même instant.

---

# 58. Média

Les images des questions doivent être :

- optimisées ;
- redimensionnées ;
- compressées ;
- chargées uniquement lorsque nécessaires.

Éviter les fichiers lourds.

Pas de vidéo en V1.

---

# 59. Performance mobile

Priorités :

1. affichage rapide de la question ;
2. boutons immédiatement utilisables ;
3. peu de JavaScript inutile ;
4. aucune animation bloquante ;
5. images optimisées ;
6. aucune vidéo de fond ;
7. pas de bibliothèque lourde sans justification.

---

# 60. Accessibilité

Minimum :

- contraste suffisant ;
- texte lisible ;
- boutons suffisamment grands ;
- état sélectionné identifiable autrement que par la seule couleur ;
- navigation clavier raisonnable ;
- `aria-label` lorsque nécessaire.

---

# 61. Design system

Le design doit utiliser des variables :

```text
--brand-primary
--brand-secondary
--brand-accent
--background
--surface
--text-primary
--text-secondary
--success
--error
```

Ne pas disperser des valeurs de couleur arbitraires dans le code.

Les couleurs, logos et typographies définitifs seront alignés sur l’identité MESTE.

---

# 62. Conformité et données personnelles

Principe :

**collecter le minimum nécessaire.**

La participation au quiz ne doit pas automatiquement :

- inscrire à une newsletter ;
- autoriser le marketing ;
- donner un consentement promotionnel.

Si MESTE souhaite collecter ultérieurement un numéro ou email :

- collecte séparée ;
- consentement explicite ;
- finalité indiquée.

Prévoir une table `consents`.

---

# 63. Logs

Ne jamais enregistrer dans les logs :

- token de session brut ;
- mot de passe ;
- secret ;
- connection string Neon.

Les erreurs techniques doivent rester exploitables sans exposer les données sensibles.

---

# 64. Variables d’environnement

Prévoir au minimum :

```text
DATABASE_URL

APP_URL

SESSION_SECRET

ADMIN_AUTH_SECRET
```

Ajouter uniquement les secrets réellement nécessaires.

Aucun fichier `.env` réel ne doit être versionné.

Créer :

```text
.env.example
```

sans valeurs sensibles.

---

# 65. GitHub

Repository dédié.

Branches courtes.

Exemples :

```text
feat/database-schema
feat/player-registration
feat/game-engine
feat/admin-dashboard
feat/leaderboard
fix/...
```

Chaque changement significatif doit être vérifiable avant fusion.

---

# 66. CI

Chaque Pull Request doit exécuter au minimum :

```text
lint
typecheck
tests
build
```

Une PR ne doit pas être considérée terminée si le build échoue.

---

# 67. Tests unitaires indispensables

Priorité absolue au moteur de jeu.

Tests :

- bonne réponse ;
- mauvaise réponse ;
- bonus difficulté ;
- bonus vitesse ;
- minimum vitesse ;
- maximum vitesse ;
- streak 3 ;
- streak 5 ;
- streak 8 ;
- reset streak ;
- réponse tardive ;
- réponse multiple ;
- question annulée ;
- recalcul de classement.

---

# 68. Tests d’intégration

Tester :

### Inscription

```text
visiteur
→ pseudo
→ joueur
```

### Réponse

```text
question ouverte
→ réponse
→ score
```

### Réponse multiple

```text
première réponse acceptée
deuxième réponse refusée
```

### Question fermée

```text
réponse refusée
```

### Annulation

```text
scores associés invalidés
```

---

# 69. Test E2E prioritaire

Scénario complet :

```text
1. ouvrir le site
2. s’inscrire
3. entrer dans une session
4. voir une question
5. répondre
6. attendre la fermeture
7. voir le résultat
8. consulter le score
9. consulter le classement
```

---

# 70. Critères de recette

La V1 n’est considérée comme prête que si :

- inscription fonctionnelle sur smartphone ;
- persistance du joueur après refresh ;
- question affichée correctement ;
- une seule réponse possible ;
- timer serveur respecté ;
- score correct ;
- classement correct ;
- question annulable ;
- administration protégée ;
- aucune bonne réponse exposée avant fermeture ;
- build production réussi ;
- base de données migrée ;
- test grandeur nature réalisé.

---

# 71. Dashboard — MUST HAVE

- nombre de joueurs ;
- joueurs actifs ;
- session en cours ;
- question actuelle ;
- réponses reçues ;
- taux de réussite ;
- Top 10 ;
- boutons de contrôle ;
- accès aux questions ;
- accès aux joueurs.

---

# 72. SHOULD HAVE

Après les MUST HAVE :

- streak visuel ;
- images ;
- progression ;
- QR joueur ;
- récompenses ;
- statistiques supplémentaires.

---

# 73. NICE TO HAVE

Seulement si tout le reste est stable :

- animations avancées ;
- badges ;
- classement animé ;
- partage de score ;
- effets de transition ;
- statistiques enrichies.

---

# 74. Hors V1

Ne pas développer avant le 15 août :

- bot WhatsApp complet ;
- Groups API ;
- audio interactif ;
- vidéo ;
- équipes ;
- marketplace de récompenses ;
- notifications push ;
- application native ;
- moteur sponsor complexe ;
- multilingue complet ;
- intelligence artificielle dans le gameplay ;
- génération automatique des questions ;
- système de paiement ;
- architecture microservices.

---

# 75. Plan B opérationnel

Le jour J, le quiz ne doit pas dépendre exclusivement d’un seul lien WhatsApp.

Prévoir :

- QR code affichable ;
- URL courte ;
- accès direct au classement ;
- accès admin depuis un second appareil.

L’administrateur doit pouvoir continuer à contrôler une session même si WhatsApp devient temporairement indisponible.

---

# 76. Charge V1

L’application doit être conçue pour fonctionner avec plusieurs centaines de participants simultanés et ne pas introduire volontairement de blocage empêchant une montée vers environ 1 000 participants.

La stratégie doit limiter :

- requêtes inutiles ;
- polling excessif ;
- lectures DB répétitives ;
- média lourd.

Un test de charge léger doit être réalisé avant l’événement.

---

# 77. Observabilité minimale

Prévoir :

- logs d’erreur ;
- logs d’actions administrateur ;
- health check simple ;
- détection des erreurs serveur ;
- possibilité de consulter rapidement les erreurs le jour J.

Ne pas construire une plateforme d’observabilité complexe.

---

# 78. Audit

Les actions administratives importantes doivent produire un `audit_log`.

Exemples :

```text
QUESTION_CREATED
QUESTION_VALIDATED
SESSION_STARTED
QUESTION_STARTED
QUESTION_CANCELED
SCORE_ADJUSTED
PLAYER_DISABLED
SESSION_FINISHED
```

---

# 79. Export

L’administrateur doit pouvoir exporter au minimum :

### Joueurs

CSV.

### Classement

CSV.

### Réponses

CSV.

Colonnes cohérentes et facilement exploitables dans Excel / Google Sheets.

---

# 80. Rétroplanning

## 12 août — Architecture et moteur

À terminer :

- repository ;
- Next.js ;
- Neon ;
- migrations ;
- modèle de données ;
- inscription ;
- session joueur ;
- moteur de questions ;
- scoring ;
- réponses.

Objectif :

**un parcours joueur complet fonctionne de bout en bout.**

---

## 13 août — Administration

À terminer :

- connexion admin ;
- CRUD questions ;
- sources ;
- sessions ;
- lancement question ;
- clôture ;
- révélation ;
- classement ;
- ajustement score.

Objectif :

**une personne MESTE peut organiser le quiz sans intervention développeur.**

---

## 14 août — Stabilisation

Aucune fonctionnalité importante non indispensable.

Priorités :

- tests ;
- mobile ;
- bugs ;
- sécurité ;
- test de charge ;
- test sur plusieurs téléphones ;
- QR code ;
- contenu ;
- questions validées ;
- répétition générale.

Fin de journée :

# FEATURE FREEZE

Après ce point, uniquement des corrections critiques.

---

## 15 août — Production

Avant ouverture :

- test du site ;
- test Neon ;
- test admin ;
- test joueur ;
- test classement ;
- test QR ;
- vérification heure système ;
- vérification questions.

Pendant :

- un opérateur quiz ;
- un administrateur de secours ;
- surveillance des erreurs ;
- contrôle manuel du classement final.

---

# 81. Découpage recommandé pour Codex

Ne pas demander à Codex :

> « Construis toute l’application. »

Décomposer le développement.

### TASK 01

Bootstrap projet + architecture.

### TASK 02

Schéma PostgreSQL + migrations.

### TASK 03

Inscription joueur + session.

### TASK 04

Bibliothèque de questions.

### TASK 05

Moteur de session.

### TASK 06

Réponse + scoring + anti-double réponse.

### TASK 07

Interface joueur.

### TASK 08

Classement.

### TASK 09

Authentification et dashboard admin.

### TASK 10

Contrôle live.

### TASK 11

Exports + audit logs.

### TASK 12

Tests + QA + production.

---

# 82. Règles Codex

Créer à la racine :

```text
AGENTS.md
```

Codex devra recevoir notamment les règles suivantes :

1. lire ce cahier des charges avant toute modification importante ;
2. ne jamais inventer une fonctionnalité non prévue ;
3. privilégier la simplicité ;
4. ne jamais exposer un secret au client ;
5. ne jamais exposer la bonne réponse avant la clôture ;
6. toute règle de scoring doit être implémentée côté serveur ;
7. toute modification du scoring nécessite des tests ;
8. toute migration DB doit être versionnée ;
9. ne jamais modifier des données de production sans instruction explicite ;
10. exécuter lint, typecheck, tests et build avant de déclarer une tâche terminée ;
11. expliquer brièvement les changements apportés ;
12. signaler toute divergence entre le code et le cahier des charges.

---

# 83. Définition de DONE

Une tâche n’est pas « terminée » simplement parce que le code a été écrit.

DONE signifie :

```text
code écrit
+
typecheck OK
+
lint OK
+
tests concernés OK
+
build OK
+
pas de secret exposé
+
fonction testée
+
modifications documentées
```

---

# 84. Priorité absolue

En cas de conflit entre :

- une animation graphique ;
- une fonctionnalité secondaire ;
- un système sophistiqué ;

et :

- enregistrement fiable des réponses ;
- exactitude des scores ;
- disponibilité ;
- fonctionnement mobile ;

les fonctions de jeu critiques gagnent systématiquement.

---

# 85. Critère final de réussite

Le 15 août 2026, un invité doit pouvoir :

```text
scanner un QR code
        ↓
choisir un pseudo
        ↓
rejoindre le quiz
        ↓
voir une question
        ↓
répondre
        ↓
recevoir ses points
        ↓
voir sa position
        ↓
continuer le jeu
```

sans :

- créer un compte complexe ;
- installer une application ;
- envoyer sa réponse publiquement dans WhatsApp ;
- comprendre la technologie utilisée.

L’administrateur MESTE doit pouvoir contrôler intégralement le déroulement du quiz depuis une interface web.

C’est le périmètre de référence de la V1.
