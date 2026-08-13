# Seed éditorial — 66e anniversaire de l’indépendance

Ce seed prépare l’événement suivant sans l’ouvrir aux joueurs :

- nom : `Tombola - Fête de l'indépendance de la République du Congo - 66e anniversaire` ;
- fuseau technique : `Africa/Accra` ;
- fenêtre : du 15 août 2026 à 00:00 au 16 août 2026 à 00:00 dans ce fuseau ;
- état initial de l’événement et des six sessions : `DRAFT` ;
- contenu : 5 catégories, 50 questions validées et sourcées, 6 sessions de 10 questions.

Les deux modes prévus par le cahier des charges sont utilisés : deux sessions `DISCOVERY` et quatre sessions `LIVE`. Les horaires des sessions restent volontairement vides : l’opérateur pourra les préciser dans `/admin/sessions` ou conduire les sessions manuellement. Toutes les questions ont une durée initiale de 30 secondes.

## Garde-fous

La commande :

- ne lit pas `.env` et exige explicitement `DATABASE_URL_UNPOOLED` ;
- refuse une URL Neon poolée dont l’hôte contient `-pooler` ;
- ne modifie rien sans `--apply` ;
- exige une cible et une phrase de confirmation propres à la preview ou à la production ;
- exige l’adresse d’un administrateur actif, utilisée pour la traçabilité des validations ;
- emploie des identifiants déterministes et ne duplique pas les données lors d’une seconde exécution ;
- refuse un événement, une catégorie, une question ou une session portant les mêmes identifiants avec un contenu différent.

Un lancement sans argument valide uniquement le manifeste et n’établit aucune connexion :

```bash
npm run content:seed:independence-66
```

## Validation sur la branche Neon de la PR

Le workflow Neon exécute le test d’intégration sur la branche éphémère de la PR. Le test applique deux fois le seed, vérifie son idempotence et contrôle les volumes attendus avant de supprimer ses données temporaires. Il refuse de s’exécuter hors d’un événement GitHub `pull_request` avec `DATABASE_INTEGRATION_TARGET=neon-preview`.

Une validation manuelle sur cette même branche peut être réalisée avec son URL directe :

```bash
cd /Users/khennydemby/Dev/MESTE-JEU

read -s "DATABASE_URL_UNPOOLED?Collez l’URL directe de la branche Neon de PR : "
echo
export DATABASE_URL_UNPOOLED

npm run content:seed:independence-66 -- \
  --apply \
  --target preview \
  --admin-email VOTRE_ADRESSE_ADMIN \
  --confirm SEED-INDEPENDENCE-66-PREVIEW

unset DATABASE_URL_UNPOOLED
```

Après `read -s`, le terminal attend le collage de l’URL. Les caractères restent invisibles pour ne pas afficher le secret ; il faut coller l’URL puis appuyer sur Entrée.

## Exécution en production après fusion

Cette étape est une modification des données de production. Elle ne doit être réalisée qu’après :

1. la réussite du workflow Neon de la PR ;
2. la fusion et le déploiement de la PR ;
3. l’identification d’un point de restauration Neon récent ;
4. la vérification visuelle du nom de branche et de l’hôte de production dans la console Neon ;
5. une confirmation explicite de l’opérateur.

```bash
cd /Users/khennydemby/Dev/MESTE-JEU

read -s "DATABASE_URL_UNPOOLED?Collez l’URL Neon directe de production : "
echo
export DATABASE_URL_UNPOOLED

npm run content:seed:independence-66 -- \
  --apply \
  --target production \
  --admin-email VOTRE_ADRESSE_ADMIN \
  --confirm SEED-INDEPENDENCE-66-PRODUCTION

unset DATABASE_URL_UNPOOLED
```

La commande affiche uniquement l’hôte et le nom de la base, jamais l’URL complète. Après exécution, l’opérateur doit contrôler dans `/admin/questions` et `/admin/sessions` les 50 questions, leurs sources, les six conducteurs et le fuseau `Africa/Accra`, puis rendre prête la première session et ouvrir les inscriptions au moment voulu.

La suppression d’un événement n’est pas incluse dans ce seed. Une transition explicite vers `CANCELED`, avec contrôle des dépendances et audit, doit être traitée comme une tâche fonctionnelle séparée ; un effacement physique serait incompatible avec la conservation des joueurs, réponses, scores et journaux d’audit.
