# Inscription et session joueur — V1

TASK 03 fournit l'inscription sans email ni mot de passe et la restauration de session après rechargement.

## Inscription

```http
POST /api/register
Content-Type: application/json

{
  "eventSlug": "heritage-congo-2026",
  "nickname": "Makaya"
}
```

Le pseudo est normalisé en Unicode NFKC, les espaces sont normalisés et la longueur autorisée est de 3 à 20 caractères. PostgreSQL garantit ensuite son unicité insensible à la casse à l'intérieur de l'événement.

Une inscription est acceptée uniquement lorsque l'événement est `READY` ou `LIVE`. La création du joueur et de sa session s'effectue dans une unique requête PostgreSQL atomique. Une erreur sur la session annule donc aussi la création du joueur.

Réponse `201` :

```json
{
  "player": {
    "publicCode": "HC-084200",
    "nickname": "Makaya",
    "currentStreak": 0
  },
  "event": {
    "slug": "heritage-congo-2026",
    "name": "Héritage Congo 2026",
    "timezone": "Africa/Accra",
    "status": "READY"
  }
}
```

Le corps ne contient jamais le token de session.

## Cookie de session

Le serveur génère un token aléatoire de 256 bits. Le navigateur reçoit ce token dans le cookie hôte `meste_player_session` configuré avec :

- `HttpOnly` ;
- `SameSite=Lax` ;
- `Secure` en production ;
- `Path=/` ;
- expiration après 30 jours.

La base stocke uniquement une empreinte HMAC-SHA-256 calculée avec `SESSION_SECRET`. Le token brut et le secret ne doivent jamais être écrits dans les logs.

## Joueur courant

```http
GET /api/me
```

L'endpoint vérifie l'empreinte du cookie, l'expiration, la révocation et le statut actif du joueur. Il met à jour les dates de dernière activité puis renvoie uniquement les données publiques du joueur et de son événement.

Toutes les réponses de ces endpoints utilisent `Cache-Control: no-store`.

## Erreurs publiques

| Statut | Code | Situation |
|---:|---|---|
| 400 | `INVALID_JSON` | corps JSON illisible |
| 400 | `INVALID_REGISTRATION` | pseudo ou événement invalide |
| 401 | `UNAUTHENTICATED` | cookie absent, expiré, révoqué ou joueur désactivé |
| 404 | `EVENT_NOT_FOUND` | événement inconnu |
| 409 | `NICKNAME_ALREADY_USED` | pseudo déjà réservé dans l'événement |
| 409 | `REGISTRATION_UNAVAILABLE` | événement hors phase d'inscription |
| 503 | `REGISTRATION_TEMPORARILY_UNAVAILABLE` | code public non réservable après plusieurs tentatives |

Les erreurs techniques inattendues restent génériques et n'exposent aucune information de connexion ou donnée interne.

## Validation PostgreSQL en PR

Après la migration de la branche Neon éphémère, le workflow exécute `npm run test:integration:db`. Ce test crée un événement isolé, inscrit un joueur, vérifie l'empreinte stockée, le conflit de pseudo et la restauration de session, puis supprime toutes ses données. Une garde bloque explicitement son exécution hors d'un workflow de Pull Request ciblant une prévisualisation Neon.
