const vscode = require('vscode');

const Selection = vscode.Selection;
const Position = vscode.Position;

const REGEX = [
    /import ({?\s?[{\sA-Za-z\-\_\,]+\s?}?) from (["'][@A-Za-z0-9\-\/\~\.]+["'])(;?)/,
    /import (["'][@A-Za-z0-9\-\/\~\.]+["'])()(;?)/,
];

const NO_IMPORTS = 'No valid import statements found';

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

function emptySelection(sel) {
    return sel.start.line === sel.end.line && sel.start.character === sel.end.character;
}

function buildImportStatement(item) {
    return item !== '' && `import ${item.import && item.import}${item.import && ' from '}${item.package}${item.semicolon ? ';' : ''}` || '';
}

function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.sortImports', () => {

        let editor = vscode.window.activeTextEditor;
        if(!editor) {
            return;
        }

        const doc = editor.document;
        let selection = editor.selection;

        if(emptySelection(selection)) {
            let startLine = 0;
            let lastLine = 0;
            let numOfLines = doc.lineCount;

            for (let i = 0; i < numOfLines; i++) {
                const line = doc.lineAt(i).text;
                let matchedLine = false;
                REGEX.forEach(re => {
                    if (re.test(line)) {
                        matchedLine = true;
                        startLine = i;
                    }
                });
                if (matchedLine) break;
            }

            for (let i = startLine; i < numOfLines; i++) {
                const line = doc.lineAt(i).text;
                REGEX.forEach(re => {
                    if (re.test(line)) lastLine = i;
                });
            }

            if(startLine === lastLine || startLine > lastLine) {
                vscode.window.showInformationMessage(NO_IMPORTS);
                return;
            }

            let startPos = doc.lineAt(startLine).range.start;
            let endPos = doc.lineAt(lastLine).range.end;
            selection = new Selection(startPos, endPos);
        }

        let text = doc.getText(selection);
        let lines = text.split('\n');

        const splitLines = lines.filter(line => Boolean(line)).map(line => {
            let ret = null;
            REGEX.forEach(re => {
                if(re.test(line)) {
                    const match = re.exec(line);
                    ret = {
                        import: match[2] && match[1] || '',
                        package: match[2] || match[1],
                        semicolon: match[3] ? true : false,
                    }
                }
            });

            return ret;
        });

        const groupedImports = {};

        splitLines.forEach(line => {
            let packageName = line.package.split('/');
            let key = packageName[0];

            if (packageName.length > 2)
                key = `${packageName[0]}/${packageName[1]}`;

            if (!groupedImports[key])
                groupedImports[key] = {};
            
            groupedImports[key][line.import] = line;
        });

        console.log(groupedImports);

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

        console.log(secondPassRegroupedImports);

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

        console.log(finalPass);

        const localImports = [];
        if(finalPass.localImports) {
            const keys = Object.keys(finalPass.localImports).sort();
            keys.forEach(key => {
                localImports.push(...finalPass.localImports[key], '');
            });
            delete finalPass.localImports;
        }

        const newLines = [];

        traverseObject(finalPass, key => {
            newLines.push(finalPass[key].map(item => buildImportStatement(item)).join('\n'));
        });
        
        newLines.push(localImports.map(item => buildImportStatement(item)).join('\n'));

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