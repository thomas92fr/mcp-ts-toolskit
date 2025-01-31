import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

interface MethodSignature {
    returnType: string;
    name: string;
    parameters: string;
    accessibility: string;
}

interface CSharpFileInfo {
    filePath: string;
    usings: string[];
    methods: MethodSignature[];
}

interface AccessibilityOptions {
    public: boolean;
    private: boolean;
    protected: boolean;
    internal: boolean;
    protectedInternal: boolean;
    privateProtected: boolean;
}

interface AnalyzerOptions {
    accessibility: AccessibilityOptions;
    includeStatic: boolean;
    namespaceFilter: string[];
}

const defaultOptions: AnalyzerOptions = {
    accessibility: {
        public: true,
        private: false,
        protected: false,
        internal: false,
        protectedInternal: false,
        privateProtected: false
    },
    includeStatic: true,
    namespaceFilter: []
};

function parseAccessibility(modifier: string | undefined): string {
    if (!modifier) return 'private';
    
    modifier = modifier.toLowerCase();
    if (modifier.includes('private') && modifier.includes('protected')) return 'private protected';
    if (modifier.includes('protected') && modifier.includes('internal')) return 'protected internal';
    if (modifier.includes('static')) return 'public';
    return modifier;
}

function shouldIncludeUsing(using: string, namespaceFilter: string[]): boolean {
    if (namespaceFilter.length === 0) {
        return true;
    }

    return namespaceFilter.some(namespace => 
        using.startsWith(namespace) ||
        (using.includes('=') && using.split('=')[1].trim().startsWith(namespace))
    );
}

async function analyzeCSharpFile(filePath: string, options: AnalyzerOptions = defaultOptions): Promise<CSharpFileInfo> {
    const content = await readFile(filePath, { encoding: 'utf8' });

    // Extraire les using avec une expression régulière améliorée
    const usings: string[] = [];
    const usingRegex = /^[\t ]*using[\t ]+([^;\n]+);/gm;
    let usingMatch;
    while ((usingMatch = usingRegex.exec(content)) !== null) {
        const usingStatement = usingMatch[1].trim();
        if (!usingStatement.includes('var') && shouldIncludeUsing(usingStatement, options.namespaceFilter)) {
            usings.push(usingStatement);
        }
    }

    // Extraire les signatures de méthodes
    const methods: MethodSignature[] = [];

    // Expression régulière pour capturer les méthodes publiques et privées
    const methodRegex = /(?:public|private|protected|internal|static|\[.*?\]|\s)*\s+(?:async\s+)?[\w\.<>\[\],\s]+\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:where[\s\S]*?)?{/g;
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
        const fullMatch = match[0];
        
        // Ignorer les lignes de commentaires
        const lineStart = content.lastIndexOf('\n', match.index) + 1;
        const lineEnd = content.indexOf('\n', match.index);
        const line = content.substring(lineStart, lineEnd);
        if (line.trim().startsWith('//')) continue;
        
        // Extraire les informations de la méthode
        const beforeParenthesis = fullMatch.substring(0, fullMatch.indexOf('('));
        const methodParts = beforeParenthesis.trim().split(/\s+/);
        const name = methodParts[methodParts.length - 1];
        const parameters = match[2].trim();
        
        // Extraire le modificateur d'accès et le type de retour
        const accessibilityModifiers = ['public', 'private', 'protected', 'internal', 'static'];
        const accessibilityPart = methodParts.filter(part => accessibilityModifiers.some(mod => part.includes(mod))).join(' ');
        const accessibility = parseAccessibility(accessibilityPart);
        
        // Reconstruire le type de retour
        const returnTypeParts = [];
        let foundAccessibility = false;
        for (const part of methodParts) {
            if (accessibilityModifiers.some(mod => part.includes(mod))) {
                foundAccessibility = true;
                continue;
            }
            if (foundAccessibility && part !== name) {
                returnTypeParts.push(part);
            }
        }
        const returnType = returnTypeParts.join(' ');
        
        // Vérifier les critères de filtrage
        const isConstructor = name === filePath.split(/[\/\\]/).pop()?.replace('.cs', '');
        if (isConstructor) continue;
        
        // Vérifier si c'est une propriété
        const beforeMatch = content.slice(Math.max(0, match.index - 20), match.index);
        const isProperty = beforeMatch.includes('get;') || beforeMatch.includes('set;') || beforeMatch.includes('=>');
        if (isProperty) continue;

        const shouldInclude = (() => {
            if (accessibilityPart?.includes('static') && !options.includeStatic) {
                return false;
            }

            switch (accessibility) {
                case 'public': return options.accessibility.public;
                case 'private': return options.accessibility.private;
                case 'protected': return options.accessibility.protected;
                case 'internal': return options.accessibility.internal;
                case 'protected internal': return options.accessibility.protectedInternal;
                case 'private protected': return options.accessibility.privateProtected;
                default: return false;
            }
        })();

        if (shouldInclude) {
            methods.push({
                accessibility,
                returnType: returnType.includes('async') ? `async ${returnType.replace('async', '')}` : returnType,
                name,
                parameters
            });
        }
    }

    return {
        filePath,
        usings,
        methods
    };
}

export async function analyzeDirectory(directory: string, options: AnalyzerOptions = defaultOptions): Promise<CSharpFileInfo[]> {
    const results: CSharpFileInfo[] = [];
    
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = join(directory, entry.name);
            
            if (entry.isDirectory()) {
                // Récursion dans les sous-répertoires
                const subDirResults = await analyzeDirectory(fullPath, options);
                results.push(...subDirResults);
            } else if (entry.isFile() && entry.name.endsWith('.cs')) {
                // Analyse des fichiers .cs
                const analysis = await analyzeCSharpFile(fullPath, options);
                results.push(analysis);
            }
        }
    } catch (error) {
        console.error(`Erreur lors de l'analyse du répertoire ${directory}: ${error}`);
    }
    
    return results;
}

export function serializeToCompactString(fileInfo: CSharpFileInfo, basePath: string = ''): string {
    const accessMap: { [key: string]: string } = {
        'public': 'pub',
        'private': 'prv',
        'protected': 'pro',
        'internal': 'int',
        'protected internal': 'pri',
        'private protected': 'prp',
        'static': 'st'
    };

    // Rendre le chemin relatif par rapport au basePath
    let relativePath = fileInfo.filePath;
    if (basePath && fileInfo.filePath.startsWith(basePath)) {
        relativePath = fileInfo.filePath.substring(basePath.length).replace(/^[\/\\]/, '');
    }
    // Si on veut seulement le nom du fichier, décommenter la ligne suivante
    // relativePath = relativePath.split(/[\/\\]/).pop() || relativePath;
    const usings = fileInfo.usings.join(',');
    const methods = fileInfo.methods.map(m => {
        const acc = accessMap[m.accessibility] || m.accessibility;
        const ret = m.returnType
            .replace('string', 'str')
            .replace('int', 'i')
            .replace('bool', 'b')
            .replace('void', 'v')
            .replace('Task<', 'T<')
            .replace('IEnumerable<', 'IE<')
            .replace('List<', 'L<')
            .replace('Dictionary<', 'D<')
            .replace('async ', 'a');
        
        const params = m.parameters
            .replace('string', 'str')
            .replace('int', 'i')
            .replace('bool', 'b')
            .replace('object', 'obj')
            .replace('System.', 'S.')
            .replace('Microsoft.', 'M.');

        return `${acc} ${ret} ${m.name}(${params})`;
    }).join('|');

    return `${relativePath};${usings};${methods}`;
}

export function deserializeFromCompactString(serialized: string): string {
    const [fileName, usings, methods] = serialized.split(';');
    
    const reverseAccessMap: { [key: string]: string } = {
        'pub': 'public',
        'prv': 'private',
        'pro': 'protected',
        'int': 'internal',
        'pri': 'protected internal',
        'prp': 'private protected',
        'st': 'static'
    };

    let result = `File: ${fileName}\n\n`;
    
    if (usings) {
        result += 'Usings:\n';
        usings.split(',').forEach(u => {
            result += `  ${u}\n`;
        });
    }

    if (methods) {
        result += '\nMethods:\n';
        methods.split('|').forEach(m => {
            let readable = m
                .replace(/\b(pub|prv|pro|int|pri|prp|st)\b/g, match => reverseAccessMap[match])
                .replace(/\bstr\b/g, 'string')
                .replace(/\bi\b/g, 'int')
                .replace(/\bb\b/g, 'bool')
                .replace(/\bv\b/g, 'void')
                .replace(/\bT</g, 'Task<')
                .replace(/\bIE</g, 'IEnumerable<')
                .replace(/\bL</g, 'List<')
                .replace(/\bD</g, 'Dictionary<')
                .replace(/\ba /g, 'async ')
                .replace(/\bobj\b/g, 'object')
                .replace(/\bS\./g, 'System.')
                .replace(/\bM\./g, 'Microsoft.');
            result += `  ${readable}\n`;
        });
    }

    return result;
}

export const SERIALIZATION_FORMAT_DOC = `Pour interpréter la chaîne sérialisée d'un fichier C#, voici le format et les règles de décodage :

Format général : nomFichier;using1,using2,using3;methode1|methode2

La chaîne est composée de 3 parties séparées par des points-virgules (;) :
1. Nom du fichier
2. Liste des usings (séparés par des virgules)
3. Liste des méthodes (séparées par des barres verticales |)

Pour chaque méthode, le format est : "accessibilité type_retour nom_méthode(paramètres)"

Les abréviations suivantes sont utilisées :
Modificateurs d'accès :
- pub -> public
- prv -> private
- pro -> protected
- int -> internal
- pri -> protected internal
- prp -> private protected
- st -> static

Types communs :
- str -> string
- i -> int
- b -> bool
- v -> void
- T<...> -> Task<...>
- IE<...> -> IEnumerable<...>
- L<...> -> List<...>
- D<...> -> Dictionary<...>
- a -> async
- obj -> object

Exemple : "UserService.cs;System,System.Linq;pub a T<L<str>> GetUsers(i page)"
Se traduit par :
- Fichier : UserService.cs
- Usings : System et System.Linq
- Méthode : public async Task<List<string>> GetUsers(int page)

Exemple complet :
Entrée sérialisée : 
UserService.cs;System,System.Linq,M.EntityFrameworkCore;pub a T<L<str>> GetUserNamesAsync(i pageSize, i pageNumber)|prv IE<User> FilterUsers(str searchTerm, b includeInactive)

Se traduit par :
Fichier : UserService.cs

Usings :
- System
- System.Linq
- Microsoft.EntityFrameworkCore

Méthodes :
1. public async Task<List<string>> GetUserNamesAsync(int pageSize, int pageNumber)
2. private IEnumerable<User> FilterUsers(string searchTerm, bool includeInactive)
`;