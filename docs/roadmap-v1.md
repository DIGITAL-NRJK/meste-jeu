# Roadmap V1 — MESTE Héritage Congo

Date impérative de lancement : **15 août 2026**.

Les tâches doivent être réalisées dans l'ordre et une seule tâche doit être développée à la fois.

1. TASK 01 — Bootstrap et fondations
2. TASK 02 — Schéma PostgreSQL et migrations
3. TASK 03 — Inscription joueur et session
4. TASK 04 — Bibliothèque de questions
5. TASK 05 — Moteur de session
6. TASK 06 — Réponse, scoring et anti-double réponse
7. TASK 07 — Interface joueur
8. TASK 08 — Classement
9. TASK 09 — Authentification et dashboard admin
10. TASK 10 — Contrôle live
11. TASK 11 — Exports et audit logs
12. TASK 12 — Tests, QA et production
13. TASK 13 — Administration des questions et catégories
14. TASK 14 — Programmation des événements et sessions
15. TASK 15 — Recherche, consultation et désactivation des joueurs
16. TASK 16 — Ajustements manuels des scores avec motif et audit
17. TASK 17 — Gestion et attribution des lots/récompenses
18. TASK 18 — Stabilisation responsive et densité des écrans administrateur
19. TASK 19 — Mode de recette et cycle de vie réversible avant clôture
20. TASK 20 — Gestion sécurisée des comptes administrateurs
21. TASK 21 — Édition directe et suppression protégée des questions
22. TASK 22 — Refonte de l’identité visuelle et des écrans de régie
23. TASK 23 — Correction de l’accès joueur multi-événement

## État

- TASK 01 : terminée le 12 août 2026
- TASK 02 : terminée le 12 août 2026
- TASK 03 : terminée le 12 août 2026
- TASK 04 : terminée le 12 août 2026
- TASK 05 : terminée le 12 août 2026
- TASK 06 : terminée le 12 août 2026
- TASK 07 : terminée le 12 août 2026
- TASK 08 : terminée le 12 août 2026
- TASK 09 : terminée le 13 août 2026
- TASK 10 : terminée le 13 août 2026
- TASK 11 : terminée le 13 août 2026
- TASK 12 : QA automatisée terminée le 13 août 2026 ; recette de production bloquée par les écarts listés dans `docs/production-readiness.md`
- TASK 13 : administration des questions et catégories terminée, fusionnée et déployée le 13 août 2026
- TASK 14 : programmation des événements, création des sessions, conducteur ordonné et ouverture des inscriptions terminés, fusionnés et déployés le 13 août 2026
- TASK 15 : recherche par pseudo ou code public, consultation du score et des réponses, désactivation avec révocation des sessions et audit terminées, fusionnées et déployées le 13 août 2026
- TASK 16 : ajustements signés par session, motif obligatoire, ledger `ADMIN_ADJUSTMENT` et audit `SCORE_ADJUSTED` terminés, fusionnés et déployés le 13 août 2026
- TASK 17 : catalogue des lots par événement, règles d’attribution, attribution aux joueurs et suivi de remise terminés, fusionnés et déployés le 13 août 2026
- TASK 18 : correction des débordements horizontaux, densification des écrans de régie et limitation des listes longues terminées, fusionnées et déployées le 13 août 2026
- TASK 19 : contexte `TEST` ou `PRODUCTION` distinct du cycle de vie, retour contrôlé vers `DRAFT`, clôture explicite `FINISHED` et suppression transactionnelle des joueurs de test terminés, fusionnés et déployés le 13 août 2026
- TASK 20 : création, désactivation et réactivation des comptes administrateurs depuis la régie, avec révocation des sessions, protection du dernier compte actif et audit terminés, fusionnés et déployés le 13 août 2026
- TASK 21 : remplacement des commandes de duplication et d’archivage exposées dans la régie par une édition directe avec annulation et une suppression protégée ; développement et validation locale terminés, validation PostgreSQL de la branche Neon de PR en attente
- TASK 22 : refonte du dashboard et des écrans `/admin/sessions`, `/admin/questions`, `/admin/players`, `/admin/rewards` et `/admin/accounts` à partir de la direction artistique MESTE Mama Emma ; création d’une navigation de régie partagée, harmonisation de l’accueil public, de la connexion et des écrans joueur, réduction de l’échelle des titres, sans modification des règles métier ni des commandes live ; validation locale terminée
- TASK 23 : remplacement du slug joueur historique codé en dur par la résolution serveur de l’événement de production ouvert, et ajout d’un accès direct à l’espace joueur de l’événement sélectionné dans la régie ; validation locale terminée

Le détail fonctionnel et les critères de recette restent définis dans `docs/cahier-des-charges-v1.md`.
