# Serveur MCP TS Toolkit

Un serveur de Protocole de Contexte de Modèle (MCP) qui fournit une suite d'outils sécurisés et configurables pour manipuler le système de fichiers, effectuer des recherches web, convertir des documents et gérer des projets npm et .NET.

Ce serveur intègre une validation stricte des paramètres via Zod, une gestion avancée des logs avec Winston, et un système de configuration flexible permettant de contrôler précisément l'accès aux différents outils et ressources.

## Configuration

1. Configurer le serveur MCP dans votre configuration Claude :

Sur MacOS : `~/Library/Application Support/Claude/claude_desktop_config.json`
Sur Windows : `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "toolskit": {
      "command": "node",
      "args": ["/chemin/vers/toolskit/build/index.js"],
      "env": {
        "MCP_TOOLSKIT_CONFIG_PATH": "C:/tmp/config.json"
      }     
    }
  }
}
```

## Fonctionnalités

Ce serveur fournit plusieurs catégories d'outils :

### Outils FileSystem
- Lister les répertoires autorisés
- Lire plusieurs fichiers simultanément
- Obtenir des informations détaillées sur les fichiers
- Rechercher des fichiers selon des critères
- Déplacer des fichiers
- Afficher l'arborescence des répertoires
- Lister le contenu des répertoires
- Créer des répertoires
- Éditer des fichiers
- Écrire des fichiers

### Outils Git
- Cloner des dépôts
- Gérer les commits
- Synchroniser avec les dépôts distants (pull/push)
- Gérer les branches (checkout)
- Gérer les conflits
- Comparer des versions (diff)
- Consulter l'historique (log)

### Outils Web
- Effectuer des recherches via le moteur Brave Search

### Outils IA (PiAPI)
- Génération d'images à partir de descriptions textuelles
- Génération de modèles 3D à partir d'images
- Génération de musique avec ou sans paroles
- Extension de musiques existantes

### Outils Pandoc
- Convertir des documents Markdown vers d'autres formats (DOCX, PPTX, HTML)

### Outils NPM
- Installer les dépendances d'un projet
- Construire un projet

### Outils .NET
- Exécuter des opérations sur les solutions .NET (tests unitaires, rapports)
- Analyser et sérialiser des fichiers source C#

## Installation

### Prérequis
1. Node.js et npm installés
2. Git installé (pour les outils Git)
3. Pandoc installé (pour les conversions de documents)
4. SDK .NET (pour les outils .NET)
5. Une clé API Brave Search (pour les recherches web)
6. Une clé API PiAPI (pour les outils d'IA)

### Installation
1. Installer les dépendances :
```bash
npm install
```

2. Compiler le serveur :
```bash
npm run build
```

## Outils disponibles

### Système de fichiers

#### list_allowed_directories
Liste tous les répertoires accessibles par le serveur.
- Pas de paramètres requis
- Retourne la liste des chemins absolus des répertoires autorisés

#### read_multiple_files
Lit plusieurs fichiers simultanément. Plus efficace que la lecture individuelle pour l'analyse ou la comparaison de fichiers.
- Paramètres requis :
  - paths : Tableau des chemins de fichiers à lire
- Validation :
  - Vérifie que les chemins sont dans les répertoires autorisés
  - Gestion des erreurs par fichier (l'échec d'un fichier n'arrête pas l'opération)

#### get_file_info
Récupère des informations détaillées sur un fichier ou répertoire.
- Paramètres requis :
  - path : Chemin du fichier à analyser
- Retourne :
  - Taille, dates de création/modification
  - Permissions
  - Type (fichier/répertoire)

#### search_files
Recherche récursive de fichiers selon un motif.
- Paramètres requis :
  - path : Répertoire de départ
  - pattern : Motif de recherche (insensible à la casse)
- Paramètres optionnels :
  - excludePatterns : Motifs à exclure

#### move_file
Déplace ou renomme un fichier/répertoire.
- Paramètres requis :
  - source : Chemin source
  - destination : Chemin destination
- Validation :
  - Vérifie que les chemins sont dans les répertoires autorisés
  - Vérifie que la destination n'existe pas

#### directory_tree
Génère une vue arborescente en JSON d'un répertoire.
- Paramètres requis :
  - path : Répertoire à analyser
- Retourne pour chaque entrée :
  - name : Nom de l'entrée
  - type : 'file' ou 'directory'
  - children : Tableau pour les répertoires

#### list_directory
Liste détaillée du contenu d'un répertoire.
- Paramètres requis :
  - path : Répertoire à lister
- Format :
  - [FILE] pour les fichiers
  - [DIR] pour les répertoires

#### create_directory
Crée un nouveau répertoire (et ses parents si nécessaire).
- Paramètres requis :
  - path : Chemin du répertoire à créer

#### edit_file
Exécute des modifications précises dans les fichiers en remplaçant des séquences exactes de texte par du nouveau contenu.
- Paramètres requis :
  - path : Chemin complet du fichier cible (doit être dans les répertoires autorisés)
  - edits : Tableau des opérations de modification :
    - oldText : Texte exact à rechercher
    - newText : Texte de remplacement

Caractéristiques :
- Préserve l'indentation et le formatage des lignes
- Supporte les remplacements multi-lignes
- Valide les chemins de fichiers pour la sécurité
- Génère un diff unifié style git
- Fonctionne uniquement dans les répertoires autorisés

#### write_file
Crée ou écrase un fichier avec du nouveau contenu.
- Paramètres requis :
  - path : Chemin du fichier
  - content : Contenu à écrire
- Validation :
  - Vérifie que le chemin est dans un répertoire autorisé

### Git

#### git_clone
Clone un dépôt Git dans un répertoire spécifique.
- Paramètres requis :
  - repositoryUrl : URL du dépôt
  - targetDir : Répertoire cible
- Paramètres optionnels :
  - branch : Branche spécifique à cloner

#### git_commit
Commit les changements dans un dépôt Git.
- Paramètres requis :
  - workingDir : Répertoire du dépôt
  - message : Message du commit
- Paramètres optionnels :
  - files : Fichiers spécifiques à commiter
  - author : Information d'auteur (format "Nom <email>")

#### git_diff
Compare les changements entre deux commits.
- Paramètres requis :
  - workingDir : Répertoire du dépôt
  - fromCommit : Hash du commit initial
  - toCommit : Hash du commit cible
- Paramètres optionnels :
  - files : Fichiers spécifiques à comparer
  - unified : Nombre de lignes de contexte (-U option)
  - ignoreSpace : Ignorer les changements d'espaces
  - ignoreBlankLines : Ignorer les lignes vides

#### git_log
Affiche l'historique des commits.
- Paramètres requis :
  - workingDir : Répertoire du dépôt
- Paramètres optionnels :
  - maxCount : Nombre maximum de commits à afficher
  - branch : Filtrer par branche
  - file : Filtrer par fichier
  - from/to : Plage de commits

#### git_pull
Récupère et intègre les changements d'un dépôt distant.
- Paramètres requis :
  - workingDir : Répertoire du dépôt
- Paramètres optionnels :
  - remote : Dépôt distant (default: origin)
  - branch : Branche à tirer (default: main)

#### git_push
Pousse les changements vers un dépôt distant.
- Paramètres requis :
  - workingDir : Répertoire du dépôt
- Paramètres optionnels :
  - remote : Dépôt distant (default: origin)
  - branch : Branche à pousser (default: main)
  - force : Forcer le push (attention)

#### git_checkout
Change de branche ou restaure des fichiers.
- Paramètres requis :
  - workingDir : Répertoire du dépôt
  - branch : Branche cible
- Paramètres optionnels :
  - createBranch : Créer la branche si elle n'existe pas

#### git_resolve_conflicts
Aide à la gestion des conflits de fusion.
- Paramètres requis :
  - workingDir : Répertoire du dépôt
- Paramètres optionnels :
  - operation : Action à effectuer (list, abort)

### Web

#### brave_web_search
Effectue une recherche web via l'API Brave Search.
- Paramètres requis :
  - query : Requête de recherche (max 400 caractères)
- Paramètres optionnels :
  - count : Nombre de résultats (1-20, défaut: 10)
  - offset : Index de départ (0-9, défaut: 0)
- Format des résultats :
  - Titre
  - Description
  - URL

#### get_web_page_content
Récupère le contenu d'une page web en utilisant Puppeteer.
- Paramètres requis :
  - url : URL de la page web à récupérer
- Retourne :
  - Contenu HTML simplifié de la page
  - Supprime les balises script, style, iframe et img
  - Conserve le texte et les liens

### Pandoc

#### markdown_to_document
Convertit un document Markdown vers d'autres formats.
- Paramètres (un des deux requis) :
  - content : Contenu Markdown direct
  - inputPath : Chemin du fichier source
- Paramètres optionnels :
  - format : Format de sortie (docx, pptx, html)
  - outputPath : Chemin du fichier de sortie
  - templatePath : Chemin du template
  - openAfterGeneration : Ouvrir après génération

### NPM

#### npm_install
Exécute 'npm install' dans un répertoire.
- Paramètres requis :
  - workingDir : Répertoire de travail
- Validation :
  - Vérifie la présence de package.json
  - Vérifie les permissions d'écriture

#### npm_build
Exécute 'npm run build' dans un répertoire.
- Paramètres requis :
  - workingDir : Répertoire de travail
- Validation :
  - Vérifie la présence de package.json
  - Vérifie l'existence du script build

### .NET

#### dotnet_tool
Exécute des opérations sur une solution .NET.
- Paramètres requis :
  - solutionFile : Chemin de la solution
- Paramètres optionnels :
  - operation : Opération à effectuer (RunTests par défaut)
- Validation :
  - Vérifie l'existence de la solution
  - Vérifie la présence du SDK .NET

#### serialize_csharp
Analyse et sérialise les fichiers source C# dans un répertoire.
- Paramètres requis :
  - path : Chemin du répertoire contenant les fichiers C# à analyser
- Paramètres optionnels :
  - options :
    - accessibility : Configuration des niveaux d'accessibilité à inclure
      - public : Inclure les méthodes publiques (défaut: true)
      - private : Inclure les méthodes privées (défaut: false)
      - protected : Inclure les méthodes protégées (défaut: false)
      - internal : Inclure les méthodes internal (défaut: false)
      - privateProtected : Inclure les méthodes private protected (défaut: false)
      - protectedInternal : Inclure les méthodes protected internal (défaut: false)
    - includeStatic : Inclure les méthodes statiques (défaut: true)
    - namespaceFilter : Liste des namespaces à inclure (si vide, tous les namespaces sont inclus)
- Retourne :
  - Analyse détaillée des using directives
  - Signatures des méthodes
  - Informations d'accessibilité

### Outils PiAPI

#### piapi_text_to_image
Génère une image à partir d'une description textuelle.
- Paramètres requis :
  - prompt : Description textuelle de l'image à générer
- Paramètres optionnels :
  - model : Modèle à utiliser (flux1-dev, flux1-dev-advanced, flux1-schnell)
  - width : Largeur de l'image (64-1024, défaut: 512)
  - height : Hauteur de l'image (64-1024, défaut: 512)
  - negative_prompt : Description des éléments à éviter

#### piapi_image_to_3d
Convertit une image en modèle 3D.
- Paramètres requis :
  - image_path ou image_url : Chemin local ou URL de l'image source
- Paramètres optionnels :
  - seed : Seed de génération (défaut: 0)
  - ss_sampling_steps : Étapes d'échantillonnage SS (10-50)
  - slat_sampling_steps : Étapes d'échantillonnage SLAT (10-50)
  - ss_guidance_strength : Force du guidage SS (0-10)
  - slat_guidance_strength : Force du guidage SLAT (0-10)

#### piapi_music_generation
Génère de la musique à partir d'une description textuelle.
- Paramètres requis :
  - gpt_description_prompt : Description de la musique à générer
- Paramètres optionnels :
  - model : Modèle à utiliser (music-u, music-s)
  - task_type : Type de tâche (generate_music, generate_music_custom)
  - lyrics_type : Type de paroles (generate, instrumental, user)
  - tags : Types de musique (format: 'tag1,tag2')
  - negative_tags : Styles à éviter
  - prompt : Paroles personnalisées
  - make_instrumental : Génère une version instrumentale

#### piapi_extend_music
Étend une musique existante générée par PiAPI.
- Paramètres requis :
  - continue_clip_id : ID du clip musical à étendre
  - prompt : Paroles personnalisées pour l'extension
- Paramètres optionnels :
  - tags : Types de musique
  - negative_tags : Styles à éviter

#### piapi_get_task_status
Vérifie le statut d'une tâche PiAPI.
- Paramètres requis :
  - taskId : ID de la tâche à surveiller
- Paramètres optionnels :
  - checkInterval : Intervalle entre les vérifications (1000-10000ms)

### Logging et Diagnostics

#### get_logs
Permet de consulter les dernières entrées des logs du serveur.
- Paramètres optionnels :
  - count : Nombre d'entrées à afficher
- Retourne :
  - Tableau des dernières entrées de log
  - Chaque entrée contient :
    - Timestamp
    - Niveau de log
    - Message
    - Contexte d'opération

## Développement

Pour le développement avec recompilation automatique :
```bash
npm run watch
```

### Architecture
- Validation des paramètres via Zod
- Gestion des erreurs complète
- Système de logging avancé avec Winston
- Configuration flexible via variables d'environnement
- Support TypeScript complet

### Gestion des erreurs
Le serveur inclut une gestion complète des erreurs avec logging pour :
- Problèmes d'accès aux fichiers
- Erreurs de conversion de documents
- Échecs des commandes npm
- Erreurs de compilation .NET
- Problèmes de configuration
- Validation des paramètres
- Erreurs d'API (Brave Search)

### Logging
Le serveur utilise Winston pour un logging avancé avec :
- Rotation quotidienne des fichiers de log
- Contexte d'opération pour le suivi

### Sécurité
- Validation stricte des chemins de fichiers
- Liste blanche de répertoires accessibles
- Pas d'exécution de code arbitraire

## Licence

Ce projet est sous licence Apache 2.0 - voir le fichier [LICENSE](LICENSE) pour plus de détails.