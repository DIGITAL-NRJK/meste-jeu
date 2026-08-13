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
- TASK 18 : correction des débordements horizontaux, densification des écrans de régie et limitation des listes longues développées et validées localement ; fusion et déploiement en attente
- TASK 19 : prévue ; permettre une recette en production clairement identifiée, le retour d’un événement non clôturé vers `DRAFT`, la suppression de joueurs uniquement en contexte de test et conserver uniquement la désactivation en `LIVE`

Le détail fonctionnel et les critères de recette restent définis dans `docs/cahier-des-charges-v1.md`.
