/**
 * @author linhuiw
 * @desc 利用 Ast 查找对应文件中的中文文案
 */
import * as ts from 'typescript';
import * as vscode from 'vscode';
import * as compiler from '@angular/compiler';
import { DOUBLE_BYTE_REGEX } from './const';
import { trimWhiteSpace } from './parserUtils';
import { removeFileComment } from './astUtils';

/**
 * 查找 Ts 文件中的中文
 * @param code
 */
function findTextInTs(code: string, fileName: string) {
  const matches = [];
  const activeEditor = vscode.window.activeTextEditor;
  const noCommentCode = removeFileComment(code, fileName);

  const ast = ts.createSourceFile(
    '',
    noCommentCode,
    ts.ScriptTarget.ES2015,
    true,
    ts.ScriptKind.TSX
  );

  function visit(node: ts.Node) {
    switch(node.kind) {
      case ts.SyntaxKind.StringLiteral: {
        /** 判断 Ts 中的字符串含有中文 */
        const { text } = node as ts.StringLiteral;
        if (text.match(DOUBLE_BYTE_REGEX)) {
          const start = node.getStart();
          const end = node.getEnd();
          /** 加一，减一的原因是，去除引号 */
          const startPos = activeEditor.document.positionAt(start + 1);
          const endPos = activeEditor.document.positionAt(end - 1);
          const range = new vscode.Range(startPos, endPos);
          matches.push({
            range,
            text,
            isString: true
          });
        }
        break;
      }
      case ts.SyntaxKind.JsxElement: {
        const { children } = node as ts.JsxElement;

        children.forEach(child => {
          if (child.kind === ts.SyntaxKind.JsxText) {
            const text = child.getText();

            if (text.match(DOUBLE_BYTE_REGEX)) {
              const start = child.getStart();
              const end = child.getEnd();
              const startPos = activeEditor.document.positionAt(start);
              const endPos = activeEditor.document.positionAt(end);

              const { trimStart, trimEnd } = trimWhiteSpace(code, startPos, endPos);
              const range = new vscode.Range(trimStart, trimEnd);

              matches.push({
                range,
                text: text.trim(),
                isString: false
              });
            }
          }
        });
        break;
      }
      case ts.SyntaxKind.TemplateExpression: {
        const { pos, end } = node;
        const templateContent = code.slice(pos, end);

        if (templateContent.match(DOUBLE_BYTE_REGEX)) {
          // @TODO: 逻辑待完善
        }
      }
    }

    ts.forEachChild(node, visit);
  }
  ts.forEachChild(ast, visit);

  return matches;
}

/**
 * 查找 HTML 文件中的中文
 * @param code
 */
function findTextInHtml(code) {
  const matches = [];
  const activeEditor = vscode.window.activeTextEditor;
  const ast = compiler.parseTemplate(code, 'ast.html', {
    preserveWhitespaces: false
  });
  function visit(node) {
    const value = node.value;
    if (value && (typeof value === 'string') && value.match(DOUBLE_BYTE_REGEX)) {
      const valueSpan = node.valueSpan || node.sourceSpan;
      let { start: { offset: startOffset }, end: { offset: endOffset } } = valueSpan;
      const nodeValue = code.slice(startOffset, endOffset);
      let startPos, endPos;
      /** 处理带引号的情况 */
      if (nodeValue.charAt(0) === '"' || nodeValue.charAt(0) === '\'') {
        startPos = activeEditor.document.positionAt(startOffset + 1);
        endPos = activeEditor.document.positionAt(endOffset - 1);
      } else {
        startPos = activeEditor.document.positionAt(startOffset);
        endPos = activeEditor.document.positionAt(endOffset);
      }
      const { trimStart, trimEnd } = trimWhiteSpace(code, startPos, endPos);
      const range = new vscode.Range(trimStart, trimEnd);
      matches.push({
        range,
        text: value,
        isString: true
      });
    }

    if (node.children && node.children.length) {
      node.children.forEach(visit);
    }
    if (node.attributes && node.attributes.length) {
      node.attributes.forEach(visit);
    }
  }

  if (ast.nodes && ast.nodes.length) {
    ast.nodes.forEach(visit);
  }
  return matches;
}
/**
 * 递归匹配代码的中文
 * @param code
 */
export function findChineseText(code: string, fileName: string) {
  if (fileName.endsWith('.html')) {
    return findTextInHtml(code);
  }
  return findTextInTs(code, fileName);
}