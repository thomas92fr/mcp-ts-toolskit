# Serveur MCP TS Toolkit

Un serveur de Protocole de Contexte de Modèle (MCP) qui fournit une suite complète d'outils sécurisés et configurables pour manipuler le système de fichiers, effectuer des recherches web, convertir des documents, gérer des projets npm et .NET, et accéder aux capacités d'IA générative via l'API PiAPI.ai.

Ce serveur intègre une validation stricte des paramètres via Zod, une gestion avancée des logs avec Winston, et un système de configuration flexible permettant de contrôler précisément l'accès aux différents outils et ressources.

## Version actuelle : 1.8.0

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

## Configuration PiAPI

Pour utiliser les outils d'IA, configurez votre clé API PiAPI dans le fichier de configuration :

```json
{
  "PiAPI": {
    "ApiKey": "votre_clé_api_piapi",
    "IsFreePlan": false,
    "IgnoreSSLErrors": false,
    "OuputDirectory": "C:/tmp/piapi_output"
  }
}
```

## Fonctionnalités

Ce serveur fournit plusieurs catégories d'outils :

### 🗂️ Outils FileSystem
- Lister les répertoires autorisés
- Lire plusieurs fichiers simultanément
- Rechercher des fichiers selon des critères
- Déplacer des fichiers
- Afficher l'arborescence des répertoires
- Créer des répertoires
- Éditer des fichiers avec diffs
- Écrire des fichiers
- Rechercher dans le contenu des fichiers

### 🔄 Outils Git
- Cloner des dépôts
- Gérer les commits
- Synchroniser avec les dépôts distants (pull/push/fetch)
- Gérer les branches (checkout)
- Gérer les conflits
- Comparer des versions (diff)
- Consulter l'historique (log)
- Vérifier le statut

### 🌐 Outils Web
- Effectuer des recherches via le moteur Brave Search
- Récupérer le contenu de pages web

### 🎨 Outils d'IA Générative (PiAPI)

#### Génération d'Images
- **piapi_text_to_image** : Génération d'images à partir de descriptions textuelles
- **piapi_gemini_image_generation** : Génération et édition d'images avec Gemini 2.5 Flash Image
- **piapi_derive_image** : Variation d'images existantes
- **piapi_modify_image** : Modification d'images (inpaint/outpaint)
- **piapi_generate_image_controlnet** : Génération avec ControlNet et LoRA
- **piapi_midjourney_imagine** : Génération via Midjourney
- **piapi_show_image** : Affichage d'images

#### Traitement d'Images
- **piapi_image_faceswap** : Échange de visages
- **piapi_image_rmbg** : Suppression d'arrière-plan
- **piapi_image_segment** : Segmentation d'images
- **piapi_image_upscale** : Amélioration de résolution

#### Génération de Vidéos
- **piapi_video_generation** : Génération de vidéos à partir de texte/images
- **piapi_generate_video_hunyuan** : Génération via Hunyuan
- **piapi_generate_video_skyreels** : Génération via Skyreels
- **piapi_generate_video_wan** : Génération via Wan
- **piapi_generate_video_kling** : Génération via Kling
- **piapi_generate_video_effect_kling** : Effets vidéo Kling
- **piapi_generate_video_luma** : Génération via Luma

#### Traitement de Vidéos
- **piapi_video_faceswap** : Échange de visages dans les vidéos
- **piapi_video_upscale** : Amélioration de résolution vidéo

#### Génération Audio/Musique
- **piapi_music_generation** : Génération de musique avec ou sans paroles
- **piapi_extend_music** : Extension de musiques existantes
- **piapi_generate_music_suno** : Génération via Suno
- **piapi_generate_music_for_video** : Musique pour vidéos
- **piapi_tts_zero_shot** : Synthèse vocale zero-shot

#### Modélisation 3D
- **piapi_image_to_3d** : Conversion d'images en modèles 3D

#### Utilitaires
- **piapi_get_task_status** : Surveillance du statut des tâches

### 📄 Outils Pandoc
- Convertir des documents Markdown vers d'autres formats (DOCX, PPTX, HTML)

### 📦 Outils NPM
- Installer les dépendances d'un projet
- Construire un projet

### ⚙️ Outils .NET
- Exécuter des opérations sur les solutions .NET (tests unitaires, rapports)
- Analyser et sérialiser des fichiers source C#
- Analyser les dépendances C#

### 🕐 Outils Système
- Obtenir la date et l'heure actuelles

## Installation

### Prérequis
1. Node.js et npm installés
2. Git installé (pour les outils Git)
3. Pandoc installé (pour les conversions de documents)
4. SDK .NET (pour les outils .NET)
5. Une clé API Brave Search (pour les recherches web)
6. Une clé API PiAPI.ai (pour les outils d'IA générative)

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

### 🗂️ Système de fichiers

#### toolskit:list_allowed_directories
Liste tous les répertoires accessibles par le serveur.
- Pas de paramètres requis
- Retourne la liste des chemins absolus des répertoires autorisés

#### toolskit:read_multiple_files
Lit plusieurs fichiers simultanément. Plus efficace que la lecture individuelle.
- **Paramètres requis :**
  - `paths` : Tableau des chemins de fichiers à lire

#### toolskit:search_files
Recherche récursive de fichiers selon un motif.
- **Paramètres requis :**
  - `path` : Répertoire de départ
  - `pattern` : Motif de recherche avec syntaxe glob
- **Paramètres optionnels :**
  - `excludePatterns` : Motifs à exclure

#### toolskit:search_file_content
Recherche de fichiers dont le contenu correspond à une expression régulière.
- **Paramètres requis :**
  - `path` : Répertoire de départ pour la recherche
  - `regex` : Expression régulière à rechercher
- **Paramètres optionnels :**
  - `fileExtensions` : Extensions de fichiers à inclure
  - `excludePatterns` : Motifs à exclure

#### toolskit:move_file
Déplace ou renomme un fichier/répertoire.
- **Paramètres requis :**
  - `source` : Chemin source
  - `destination` : Chemin destination

#### toolskit:directory_tree
Génère une vue arborescente YAML d'un répertoire.
- **Paramètres requis :**
  - `path` : Répertoire à analyser
- **Paramètres optionnels :**
  - `recursive` : Analyse récursive (défaut: true)

#### toolskit:create_directory
Crée un nouveau répertoire et ses parents si nécessaire.
- **Paramètres requis :**
  - `path` : Chemin du répertoire à créer

#### toolskit:edit_file
Effectue des modifications précises dans les fichiers.
- **Paramètres requis :**
  - `path` : Chemin du fichier cible
  - `edits` : Tableau des opérations de modification
    - `oldText` : Texte exact à rechercher
    - `newText` : Texte de remplacement

#### toolskit:write_file
Crée ou écrase un fichier avec du nouveau contenu.
- **Paramètres requis :**
  - `path` : Chemin du fichier
  - `content` : Contenu à écrire

### 🔄 Outils Git

#### toolskit:git_clone
Clone un dépôt Git.
- **Paramètres requis :**
  - `repositoryUrl` : URL du dépôt
  - `targetDir` : Répertoire cible
- **Paramètres optionnels :**
  - `branch` : Branche spécifique

#### toolskit:git_commit
Commit les changements.
- **Paramètres requis :**
  - `workingDir` : Répertoire du dépôt
  - `message` : Message du commit
- **Paramètres optionnels :**
  - `files` : Fichiers spécifiques
  - `author` : Information d'auteur

#### toolskit:git_status
Affiche le statut du dépôt.
- **Paramètres requis :**
  - `workingDir` : Répertoire du dépôt

#### toolskit:git_pull, toolskit:git_push, toolskit:git_fetch
Synchronisation avec les dépôts distants.
- **Paramètres requis :**
  - `workingDir` : Répertoire du dépôt
- **Paramètres optionnels :**
  - `remote` : Dépôt distant (défaut: origin)
  - `branch` : Branche (défaut: main)

#### toolskit:git_checkout
Change de branche.
- **Paramètres requis :**
  - `workingDir` : Répertoire du dépôt
  - `branch` : Branche cible
- **Paramètres optionnels :**
  - `createBranch` : Créer la branche

#### toolskit:git_diff
Compare les changements entre commits.
- **Paramètres requis :**
  - `workingDir` : Répertoire du dépôt
  - `fromCommit` : Hash du commit initial
  - `toCommit` : Hash du commit cible
- **Paramètres optionnels :**
  - `files` : Fichiers spécifiques
  - `unified` : Nombre de lignes de contexte
  - `ignoreSpace` : Ignorer les espaces
  - `ignoreBlankLines` : Ignorer les lignes vides

#### toolskit:git_log
Affiche l'historique des commits.
- **Paramètres requis :**
  - `workingDir` : Répertoire du dépôt
- **Paramètres optionnels :**
  - `maxCount` : Nombre maximum de commits
  - `branch` : Filtrer par branche
  - `file` : Filtrer par fichier
  - `from`/`to` : Plage de commits

#### toolskit:git_resolve_conflicts
Gestion des conflits de fusion.
- **Paramètres requis :**
  - `workingDir` : Répertoire du dépôt
- **Paramètres optionnels :**
  - `operation` : Action (list, abort)

### 🌐 Outils Web

#### toolskit:brave_web_search
Recherche web via l'API Brave Search.
- **Paramètres requis :**
  - `query` : Requête de recherche (max 400 chars)
- **Paramètres optionnels :**
  - `count` : Nombre de résultats (1-20, défaut: 10)
  - `offset` : Index de départ (0-9, défaut: 0)

#### toolskit:get_web_page_content
Récupère le contenu d'une page web.
- **Paramètres requis :**
  - `url` : URL de la page web

### 🎨 Outils d'IA Générative (PiAPI)

#### Génération d'Images

##### piapi_text_to_image
Génère une image à partir d'un texte.
- **Paramètres requis :**
  - `prompt` : Description de l'image
- **Paramètres optionnels :**
  - `model` : Modèle (Qubico/flux1-dev, Qubico/flux1-schnell, Qubico/flux1-dev-advanced)
  - `width`/`height` : Dimensions (64-1024, défaut: 512)
  - `negative_prompt` : Éléments à éviter
  - `steps` : Nombre d'étapes
  - `guidance_scale` : Échelle de guidage (1.5-5)
  - `batch_size` : Nombre d'images (Schnell uniquement)
  - `lora_settings` : Paramètres LoRA (version payante)
  - `control_net_settings` : Paramètres ControlNet (version payante)

##### piapi_gemini_image_generation
Génère et édite des images avec Gemini 2.5 Flash Image de Google.
- **Paramètres requis :**
  - `prompt` : Description de l'image (DOIT être en anglais)
- **Paramètres optionnels :**
  - `num_images` : Nombre d'images (1-4, défaut: 1, coût: 0.03$/image)
  - `output_format` : Format de sortie ("jpeg" ou "png", défaut: jpeg)
  - `image_urls` : URLs d'images à modifier (pour l'édition conversationnelle)

**Fonctionnalités uniques :**
- Édition conversationnelle : modification progressive d'images existantes
- Cohérence de personnages : maintien de l'apparence à travers plusieurs générations
- Approche narrative : excelle avec des descriptions fluides plutôt que des mots-clés
- Support natif de l'inpainting, outpainting et changements de style

##### piapi_midjourney_imagine
Génération d'image via Midjourney.
- **Paramètres requis :**
  - `prompt` : Description de l'image
- **Paramètres optionnels :**
  - `aspectRatio` : Ratio d'aspect

##### piapi_derive_image
Variation d'une image existante.
- **Paramètres requis :**
  - `prompt` : Description de la variation
  - `referenceImage` : URL de l'image de référence
- **Paramètres optionnels :**
  - `width`/`height` : Dimensions
  - `negativePrompt` : Éléments à éviter
  - `steps` : Nombre d'étapes

##### piapi_modify_image
Modification d'image (inpaint/outpaint).
- **Paramètres requis :**
  - `prompt` : Description de la modification
  - `referenceImage` : URL de l'image de référence
  - `model` : Type de modification ("inpaint" ou "outpaint")
- **Paramètres optionnels :**
  - `paddingLeft/Right/Top/Bottom` : Remplissage pour outpaint
  - `negativePrompt` : Éléments à éviter
  - `steps` : Nombre d'étapes

##### piapi_generate_image_controlnet
Génération avec ControlNet.
- **Paramètres requis :**
  - `prompt` : Description de l'image
  - `referenceImage` : Image de contrôle
- **Paramètres optionnels :**
  - `controlType` : Type de contrôle (depth, canny, hed, openpose)
  - `lora` : LoRA à utiliser
  - `width`/`height` : Dimensions
  - `steps` : Nombre d'étapes

#### Traitement d'Images

##### piapi_image_faceswap
Échange de visages entre images.
- **Paramètres requis :**
  - `swapImage` : URL de l'image source
  - `targetImage` : URL de l'image cible

##### piapi_image_rmbg
Suppression d'arrière-plan.
- **Paramètres requis :**
  - `image` : URL de l'image

##### piapi_image_segment
Segmentation d'image.
- **Paramètres requis :**
  - `image` : URL de l'image
  - `prompt` : Description de la segmentation
- **Paramètres optionnels :**
  - `negativePrompt` : Éléments à éviter
  - `segmentFactor` : Facteur de segmentation

##### piapi_image_upscale
Amélioration de résolution.
- **Paramètres requis :**
  - `image` : URL de l'image
- **Paramètres optionnels :**
  - `scale` : Facteur d'agrandissement (2-10, défaut: 2)
  - `faceEnhance` : Amélioration des visages

##### piapi_show_image
Affichage d'image (pour les images < 768x1024).
- **Paramètres requis :**
  - `url` : URL de l'image

#### Génération de Vidéos

##### piapi_video_generation
Génération de vidéo complète avec support des images clés.
- **Paramètres requis :**
  - `prompt` : Description de la vidéo
- **Paramètres optionnels :**
  - `task_type` : Type (video_generation, extend_video)
  - `key_frames` : Images clés (frame0, frame1)
  - `model_name` : Modèle (ray-v1, ray-v2)
  - `duration` : Durée (5-10 secondes)
  - `aspect_ratio` : Ratio d'aspect
  - `webhook_config` : Configuration webhook

##### piapi_generate_video_hunyuan
Génération via Hunyuan.
- **Paramètres requis :**
  - `prompt` : Description de la vidéo
- **Paramètres optionnels :**
  - `model` : Type (hunyuan, fastHunyuan, hunyuanConcat, hunyuanReplace)
  - `referenceImage` : Image de référence
  - `aspectRatio` : Ratio d'aspect (16:9, 1:1, 9:16)
  - `negativePrompt` : Éléments à éviter

##### piapi_generate_video_skyreels
Génération via Skyreels.
- **Paramètres requis :**
  - `prompt` : Description de la vidéo
  - `referenceImage` : Image de référence
- **Paramètres optionnels :**
  - `aspectRatio` : Ratio d'aspect
  - `negativePrompt` : Éléments à éviter

##### piapi_generate_video_wan
Génération via Wan.
- **Paramètres requis :**
  - `prompt` : Description de la vidéo
- **Paramètres optionnels :**
  - `model` : Type (wan1_3b, wan14b)
  - `referenceImage` : Image de référence (wan14b uniquement)
  - `aspectRatio` : Ratio d'aspect
  - `negativePrompt` : Éléments à éviter

##### piapi_generate_video_kling
Génération via Kling.
- **Paramètres requis :**
  - `prompt` : Description de la vidéo
- **Paramètres optionnels :**
  - `referenceImage` : Image de référence
  - `aspectRatio` : Ratio d'aspect
  - `duration` : Durée (5s, 10s)
  - `negativePrompt` : Éléments à éviter

##### piapi_generate_video_effect_kling
Effets vidéo via Kling.
- **Paramètres requis :**
  - `image` : Image de référence
- **Paramètres optionnels :**
  - `effectName` : Type d'effet (squish, expansion)

##### piapi_generate_video_luma
Génération via Luma.
- **Paramètres requis :**
  - `prompt` : Description de la vidéo
- **Paramètres optionnels :**
  - `duration` : Durée (5s, 10s)
  - `aspectRatio` : Ratio d'aspect
  - `keyFrame` : Image clé

#### Traitement de Vidéos

##### piapi_video_faceswap
Échange de visages dans les vidéos.
- **Paramètres requis :**
  - `swapImage` : URL de l'image source
  - `targetVideo` : URL de la vidéo cible

##### piapi_video_upscale
Amélioration de résolution vidéo (2x).
- **Paramètres requis :**
  - `video` : URL de la vidéo

#### Génération Audio/Musique

##### piapi_music_generation
Génération de musique avec paroles optionnelles.
- **Paramètres requis :**
  - `gpt_description_prompt` : Description de la musique
- **Paramètres optionnels :**
  - `model` : Type (music-u, music-s)
  - `task_type` : Tâche (generate_music, generate_music_custom)
  - `lyrics_type` : Type de paroles (generate, instrumental, user)
  - `tags` : Styles musicaux
  - `negative_tags` : Styles à éviter
  - `prompt` : Paroles personnalisées
  - `make_instrumental` : Version instrumentale

##### piapi_extend_music
Extension de musique existante.
- **Paramètres requis :**
  - `continue_clip_id` : ID du clip à étendre
  - `prompt` : Paroles pour l'extension
- **Paramètres optionnels :**
  - `tags` : Styles musicaux
  - `negative_tags` : Styles à éviter

##### piapi_generate_music_suno
Génération via Suno.
- **Paramètres requis :**
  - `prompt` : Description de la musique (max 3000 chars)
- **Paramètres optionnels :**
  - `makeInstrumental` : Version instrumentale
  - `title` : Titre (max 80 chars)
  - `tags` : Tags (max 200 chars)
  - `negativeTags` : Tags négatifs (max 200 chars)

##### piapi_generate_music_for_video
Génération de musique pour vidéo.
- **Paramètres requis :**
  - `prompt` : Description de la musique
  - `video` : URL de la vidéo
- **Paramètres optionnels :**
  - `negativePrompt` : Éléments à éviter

##### piapi_tts_zero_shot
Synthèse vocale zero-shot.
- **Paramètres requis :**
  - `genText` : Texte à synthétiser
  - `refAudio` : Audio de référence
- **Paramètres optionnels :**
  - `refText` : Texte de référence

#### Modélisation 3D

##### piapi_image_to_3d
Conversion d'image en modèle 3D.
- **Paramètres requis :**
  - `image_path` ou `image_url` : Image source
- **Paramètres optionnels :**
  - `seed` : Seed de génération
  - `ss_sampling_steps` : Étapes SS (10-50)
  - `slat_sampling_steps` : Étapes SLAT (10-50)
  - `ss_guidance_strength` : Force SS (0-10)
  - `slat_guidance_strength` : Force SLAT (0-10)

#### Utilitaires

##### piapi_get_task_status
Surveillance du statut des tâches.
- **Paramètres requis :**
  - `taskId` : ID de la tâche
- **Paramètres optionnels :**
  - `checkInterval` : Intervalle de vérification (1000-10000ms)

### 📄 Outils Pandoc

#### toolskit:markdown_to_document
Convertit Markdown vers d'autres formats.
- **Paramètres requis :**
  - `content` ou `inputPath` : Contenu ou fichier source
- **Paramètres optionnels :**
  - `format` : Format de sortie (docx, pptx, html)
  - `outputPath` : Fichier de sortie
  - `templatePath` : Template
  - `openAfterGeneration` : Ouvrir après génération

### 📦 Outils NPM

#### toolskit:npm_install
Installation des dépendances.
- **Paramètres requis :**
  - `workingDir` : Répertoire de travail

#### toolskit:npm_build
Construction du projet.
- **Paramètres requis :**
  - `workingDir` : Répertoire de travail

### ⚙️ Outils .NET

#### toolskit:dotnet_tool
Opérations sur les solutions .NET.
- **Paramètres requis :**
  - `solutionFile` : Chemin de la solution
- **Paramètres optionnels :**
  - `operation` : Opération (RunTests)

#### toolskit:serialize_csharp
Analyse des fichiers C#.
- **Paramètres requis :**
  - `path` : Répertoire à analyser
- **Paramètres optionnels :**
  - `options` : Configuration de l'analyse
    - `accessibility` : Niveaux d'accès à inclure
    - `includeStatic` : Inclure les méthodes statiques
    - `namespaceFilter` : Filtrer par namespace

#### toolskit:analyze_csharp_dependencies
Analyse des dépendances C#.
- **Paramètres requis :**
  - `filePath` : Fichier C# à analyser

### 🕐 Outils Système

#### toolskit:get_current_datetime
Obtient la date et l'heure actuelles.
- Pas de paramètres requis

## Ressources

Le serveur fournit également des ressources consultables :

- **Logs du serveur** : Consultation des dernières entrées de log
- **Prompts Flux1** : Ressources d'aide pour la génération d'images avec Flux
- **Prompts Gemini** : Guide d'expert pour Gemini 2.5 Flash Image (Nano Banana)
- **Prompts de génération musicale** : Guides pour la création musicale
- **Prompts vidéo** : Ressources pour la génération de vidéos

## Fonctionnalités Avancées

### Sauvegarde Automatique
Tous les outils PiAPI supportent la sauvegarde automatique des contenus générés si un répertoire de sortie est configuré dans `PiAPI.OuputDirectory`.

### Ouverture Automatique
Les fichiers générés sont automatiquement ouverts avec l'application par défaut du système.

### Gestion des Erreurs
- Validation stricte des paramètres via Zod
- Gestion complète des erreurs avec logging
- Messages d'erreur explicites pour les utilisateurs

### Optimisation des Performances
- Gestionnaire de tâches unifié pour PiAPI
- Configuration automatique des timeouts selon les modèles
- Polling intelligent pour le suivi des tâches

### Sécurité
- Validation stricte des chemins de fichiers
- Liste blanche de répertoires accessibles
- Pas d'exécution de code arbitraire
- Gestion sécurisée des clés API

## Développement

Pour le développement avec recompilation automatique :
```bash
npm run watch
```

### Architecture
- **FastMCP** : Framework MCP pour TypeScript
- **Zod** : Validation des schémas et paramètres
- **Winston** : Système de logging avancé
- **Configuration flexible** : Via variables d'environnement
- **Support TypeScript complet** : Types stricts pour tous les outils

### Structure du Projet
```
src/
├── index.ts                 # Point d'entrée principal
├── tools/                   # Tous les outils MCP
│   ├── filesystem/         # Outils de système de fichiers
│   ├── git/               # Outils Git
│   ├── web/               # Outils web
│   ├── piapi/             # Outils d'IA générative
│   │   ├── types/         # Types TypeScript
│   │   ├── task_handler.ts # Gestionnaire de tâches unifié
│   │   └── *.ts           # Outils spécifiques
│   ├── pandoc/            # Outils de conversion
│   ├── npm/               # Outils NPM
│   ├── dotnet/            # Outils .NET
│   └── system/            # Outils système
├── resources/             # Ressources consultables
├── models/               # Modèles de données
└── helpers/              # Utilitaires et helpers
```

### Logging
Le serveur utilise Winston pour un logging avancé avec :
- Rotation quotidienne des fichiers de log
- Contexte d'opération pour le suivi
- Niveaux de log configurables
- Formatage structuré

## Configuration Avancée

### Fichier de Configuration
Le serveur utilise un fichier JSON pour la configuration :

```json
{
  "AllowedDirectories": [
    "C:/Projets",
    "C:/Documents"
  ],
  "BraveSearch": {
    "ApiKey": "votre_clé_brave"
  },
  "PiAPI": {
    "ApiKey": "votre_clé_piapi",
    "IsFreePlan": false,
    "IgnoreSSLErrors": false,
    "OuputDirectory": "C:/PiAPI_Output"
  },
  "DisabledTools": [],
  "LogLevel": "info"
}
```

### Variables d'Environnement
- `MCP_TOOLSKIT_CONFIG_PATH` : Chemin vers le fichier de configuration

## Licence

Ce projet est sous licence Apache 2.0 - voir le fichier [LICENSE](LICENSE) pour plus de détails.

## Contribution

Les contributions sont les bienvenues ! Veuillez :
1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commiter vos changements
4. Pousser vers la branche
5. Ouvrir une Pull Request

## Support

Pour obtenir de l'aide :
1. Consultez la documentation
2. Vérifiez les logs du serveur
3. Ouvrez une issue sur GitHub avec les détails de votre problème
