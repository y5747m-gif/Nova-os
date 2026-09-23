# Stable Android home / Interface principale stable

## Comportement attendu

L’APK est un **lanceur Android**, pas un remplacement du système Android.
Depuis les paramètres NOVA (`الإعدادات`), la section **Interface principale**
(`الواجهة الرئيسية`) permet de demander le rôle d’accueil Android. Le choix
est confirmé par Android, jamais imposé par NOVA.

Quand NOVA est l’accueil choisi :

- Android conserve ce choix et lance NOVA avec le bouton Accueil, y compris
  après un redémarrage. Aucun service permanent ni verrouillage kiosque n’est requis.
- Retour ferme les panneaux / applications internes puis reste à l’accueil.
- NOVA n’apparaît pas comme une tâche ordinaire à balayer dans les applications récentes.
- Le démarrage ouvre directement l’accueil. Le verrouillage sécurisé et le bouton
  physique d’alimentation restent gérés par Android, sans écran de verrouillage simulé.
- Le menu d’alimentation de démonstration renvoie aux paramètres dans l’APK.
- Pour cesser d’utiliser NOVA comme accueil : **Paramètres NOVA → Interface principale
  → Changer l’interface principale / arrêter d’utiliser NOVA → Continuer vers les
  paramètres Android**, puis choisir un autre lanceur. Annuler, ou revenir sans changer
  ce choix, laisse NOVA actif. Le statut est relu au retour des paramètres.

**Limite importante :** Android peut tuer le processus pour récupérer de la mémoire,
le mettre en veille, ou autoriser un arrêt forcé / une désinstallation depuis ses
paramètres. NOVA ne peut et ne doit pas empêcher ces actions. Le rôle d’accueil
persiste indépendamment du processus ; au prochain lancement, l’interface est
reconstruite à partir des ressources locales et des préférences enregistrées.
Le mode PWA dans un navigateur n’a pas ces garanties Android.

## Corrections techniques

- Chargement déterministe de `START_URL` plutôt que restauration de l’historique
  WebView (qui ne reconstitue pas l’état JavaScript).
- Signal `NovaSystem.ready()` à la fin de l’initialisation des modules. Accueil et
  les liens profonds reçus pendant le chargement sont livrés une fois les hooks prêts,
  sans délai arbitraire de 600 ms. Les chaînes injectées sont encodées en JSON.
- Recréation de la WebView après perte de son moteur : un seul essai automatique
  par activité. Les échecs répétés donnent un écran natif avec **Recharger** et
  **Paramètres de l’accueil**, plutôt qu’une boucle de plantages.
- Le même écran de secours apparaît après 15 secondes sans signal de démarrage,
  ou si la création de la WebView échoue. Une initialisation tardive réussie le retire.
- Destruction de l’ancienne vue, annulation du délai, libération du sélecteur de
  fichiers et de la référence statique ; rejet des notifications / callbacks périmés.
- Pause / reprise de la WebView avec l’activité ; marges des barres système converties
  de pixels physiques vers pixels CSS.
- Une erreur dans un abonné du moteur d’animation est signalée et cet abonné retiré,
  sans arrêter toutes les autres animations ni empêcher leur redémarrage.
- Nettoyage de l’observateur et des abonnements de la surface des paramètres.
- Une URL externe n’est jamais chargée avec le pont Android, même si aucun navigateur
  ne peut l’ouvrir.

## Vérification automatisée

```sh
npm ci
npm run check
# Sous-ensemble :
npm run check:stability
```

`check:stability` exécute un test déterministe du ticker et deux démarrages du vrai
contrôleur sous jsdom avec un pont Android simulé (accueil actif / inactif).
Il couvre l’initialisation, Retour, Accueil, les actions de démonstration, la
confirmation / annulation du changement d’accueil et le rafraîchissement du statut.
Ces tests **ne remplacent pas** une compilation Kotlin ni un test Android réel.

## Recette Android à effectuer avant diffusion

Compiler avec Java 17, Gradle 8.9 et SDK 34 :

```sh
npm run apk:assets
cd android
gradle testDebugUnitTest assembleDebug
```

Tester au minimum Android 8/9 et Android 13/14+, en navigation boutons puis gestes :

1. Installation neuve : refuser les permissions facultatives, finir l’assistant,
   activer NOVA comme accueil. Vérifier le rôle dans les paramètres Android.
2. Ouvrir plusieurs applications réelles, revenir avec Accueil, appuyer rapidement
   dix fois sur Retour. L’accueil reste utilisable et aucune autre interface ne s’ouvre.
3. Balayer les applications récentes, verrouiller / déverrouiller et redémarrer le
   téléphone. NOVA reste l’accueil choisi ; pas de second écran de verrouillage.
4. Choisir une autre interface via les paramètres NOVA. Tester Annuler, revenir sans
   changer, puis changer réellement. NOVA ne doit pas reprendre le rôle tout seul.
5. Mettre NOVA en arrière-plan, utiliser `adb shell am kill os.nova.launcher`, puis
   Accueil. Les préférences de fond / thème persistent et l’accueil se reconstruit.
   Ne pas confondre cette simulation de mort du processus avec `am force-stop`.
6. Dans une build de diagnostic, provoquer la perte du renderer (par exemple
   `WebViewRenderProcess.terminate()` sur API 29+, via le débogueur). Vérifier une
   reconstruction, puis l’écran de secours lors d’un deuxième échec. Tester ses deux
   boutons. Ne jamais exposer cette commande dans le pont de production.
7. Suspendre le démarrage JavaScript pour tester le délai de secours de 15 secondes ;
   reprendre et vérifier que le signal `ready` retire le secours. Tester aussi un lien
   profond reçu avant la fin du chargement et un Accueil reçu ensuite.
8. Vérifier sur écran haute densité les marges, le clavier, le sélecteur d’image,
   une notification reçue durant la reprise et le retour des paramètres Android.

Dans l’environnement de cette intervention, les tests JavaScript ont été exécutés ;
la compilation et cette recette Android restent à faire (SDK / JVM / Gradle absents,
accès aux téléchargements d’outillage indisponible).
