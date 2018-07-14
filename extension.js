const vscode = require('vscode');

const Selection = vscode.Selection;
const Position = vscode.Position;

function traverseObject(obj, func) {
    for (let key in obj) {
        if (obj.hasOwnProperty(key))
            func(key);
    }
}

function objectToArray(obj) {
    const arr = [];
    traverseObject(obj, key => {
        arr.push(obj[key]);
    });
    return arr;
}

function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.sortImports', () => {

        let editor = vscode.window.activeTextEditor;
        if(!editor) {
            return;
        }

        let selection = editor.selection;
        let text = editor.document.getText(selection);

        let lines = text.split('\n');

        const regex = /import ({?\s?[{\sA-Za-z\-\_\,]+\s?}?) from ('[@A-Za-z0-9\-\/\~\.]+')(;?)/;

        const splitLines = lines.filter(line => Boolean(line)).map(line => {
            const match = regex.exec(line);
            return {
                import: match[1],
                package: match[2],
                semicolon: match[3] ? true : false,
            };
        });

        const groupedImports = {};

        splitLines.forEach(line => {
            let importWords = line.package.split('/');
            let key = importWords[0];

            if (importWords.length > 2)
                key = `${importWords[0]}/${importWords[1]}`;

            if (!groupedImports[key])
                groupedImports[key] = {};
            
            groupedImports[key][line.import] = line;
        });

        const regroupedImports = {};

        traverseObject(groupedImports, key => {
            regroupedImports[key] = objectToArray(groupedImports[key]).sort((a, b) => a.package > b.package ? 1 : -1);
        });

        const secondPassRegroupedImports = {};

        traverseObject(regroupedImports, key => {
            if(regroupedImports[key].length === 1 && !(key.charAt(1) === '.' || key.charAt(1) === '~')) {
                if(!secondPassRegroupedImports['1']) secondPassRegroupedImports['1'] = [];
                secondPassRegroupedImports['1'].push(regroupedImports[key][0])
            } else {
                secondPassRegroupedImports[key] = regroupedImports[key];
            }
        });

        const finalPass = {};
        traverseObject(secondPassRegroupedImports, key => {
            secondPassRegroupedImports[key].sort((a, b) => a.package > b.package ? 1 : -1);
            if(key.charAt(1) === '.' || key.charAt(1) === '~') {
                if(!finalPass.localImports) finalPass.localImports = {};
                finalPass.localImports[key] = (secondPassRegroupedImports[key]);
            } else {
                finalPass[key] = secondPassRegroupedImports[key];
            }
        });

        const localImports = [];
        if(finalPass.localImports) {
            const keys = Object.keys(finalPass.localImports).sort();
            keys.forEach(key => {
                localImports.push(...finalPass.localImports[key], '');
            });
            delete finalPass.localImports;
        }

        console.log(finalPass.localImports);
        console.log(localImports);

        const newLines = [];

        traverseObject(finalPass, key => {
            newLines.push(finalPass[key].map(item => item !== '' && `import ${item.import} from ${item.package}${item.semicolon ? ';' : ''}` || '').join('\n'));
        });
        
        newLines.push(localImports.map(item => item !== '' && `import ${item.import} from ${item.package}${item.semicolon ? ';' : ''}` || '').join('\n'));
        console.log(newLines);

        const e = vscode.window.activeTextEditor;
        let replacement;
        e.edit(edit => {
            edit.replace(selection, newLines.join('\n\n'));
            const start = new Position(selection.start.line, selection.start.character);
            const end = new Position(selection.end.line, selection.end.character);
            replacement = new Selection(start, end);
        });
        e.selection = replacement;
    });

    context.subscriptions.push(disposable);
}
exports.activate = activate;

function deactivate() {
}
exports.deactivate = deactivate;