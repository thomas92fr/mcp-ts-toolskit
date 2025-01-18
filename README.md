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
      "args": ["/chemin/vers/toolskit/build/index.js"]     
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

### Outils Pandoc
- Convertir des documents Markdown vers d'autres formats (DOCX, PPTX, HTML)

### Outils NPM
- Installer les dépendances d'un projet
- Construire un projet

### Outils .NET
- Exécuter des opérations sur les solutions .NET (tests unitaires, rapports)

## Installation

### Prérequis
1. Node.js et npm installés
2. Git installé (pour les outils Git)
3. Pandoc installé (pour les conversions de documents)
4. SDK .NET (pour les outils .NET)
5. Une clé API Brave Search (pour les recherches web)

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

[Les sections existantes du système de fichiers restent identiques...]

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

[Les sections Web existantes restent identiques...]

[Les autres sections restent identiques...]

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

[Le reste du README reste identique...]

## Licence

Ce projet est sous licence Apache 2.0 - voir le fichier [LICENSE](LICENSE) pour plus de détails.