#!/usr/bin/env node

import TOML from '@iarna/toml';
import arg from 'arg';
import fs from 'fs';
import matter from 'gray-matter';
import YAML from 'js-yaml';
import parseJSON from 'parse-json';
import path from 'path';
import recursiveReaddirSync from 'recursive-readdir-sync';
import stripBOM from 'strip-bom-string';
import stripJSON from 'strip-json-comments';

const args = arg({
    '--out': String,                // 指定输出位置
    '--help': Boolean,
    '--matter': String,             // 指定Markdown matter
    '--files': Boolean,             // 不合并文件
    '--pretty': Boolean,            // JSON 格式化后输出
    '--verbose': Boolean,           // 展示操作日志
    '--version': Boolean,
    // Aliases
    '-o': '--out',
    '-f': '--files',
    '-p': '--pretty',
    '-v': '--verbose',
    '-V': '--version'
});

if (args['--help']) {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'src/doc.txt'));
    console.log(text.toString());
    process.exit(0);
}

if (args['--version']) {
    console.log('show version');
    process.exit(0);
}

if (args['_'].length === 0) {
    console.error('请指定要解析的文件：', args['_']);
}

const matterOptions = {
    excerpt: false,
};

args['--verbose'] && console.log(args['--pretty'] ? 'pretty:' : 'minify:', args['_']);
args['--verbose'] && console.log('output:', args['--out']);

// 使用 TOML 解析 Front Matter
if (args['--matter'] === 'toml') {
    Object.assign(matterOptions, {
        language: 'toml',
        engines: {
            toml: TOML.parse.bind(TOML),
        }
    });
}

args['--verbose'] && console.log(`use ${(args['--matter'] === 'toml') ? 'TOML' : 'YAML'} parse markdown front matter`);

/**
 * JSON 渲染
 * @param {*} data 
 * @returns 
 */
const render = (data) => {
    return args['--pretty'] ? JSON.stringify(data, null, 2) : JSON.stringify(data);
};

/**
 * 数据写入到文件
 * @param {*} target 
 * @param {*} data 
 */
const writeFile = (target, data) => {
    const dirname = path.dirname(target);
    if (!fs.existsSync(dirname)) {
        args['--verbose'] && console.log('+-- make directory:', dirname);
        fs.mkdirSync(dirname, { recursive: true });
    }
    args['--verbose'] && console.log('+-- write file:', target);
    fs.writeFileSync(target, render(data));
};

/**
 * 解析文件
 * @param {*} filepath 
 * @returns 
 */
const parse = (filepath, unique) => {
    const content = stripBOM(fs.readFileSync(filepath).toString() || '').trim();
    args['--verbose'] && console.log('+- processing:', unique);
    switch (path.extname(filepath)) {
        case '.json':
            return {
                __type: 'JSON',
                __unique: unique,
                content: parseJSON(stripJSON(content)),
            };
        case '.md':
            const { data, content: body, excerpt, isEmpty, ...extra } = matter(content, matterOptions);
            return {
                __type: 'Markdown',
                __unique: unique,
                content: {
                    ...data,
                    ...extra,
                    body: body.trim()
                },
            };
        case '.toml':
            return {
                __type: 'TOML',
                __unique: unique,
                content: TOML.parse(content),
            };
        case '.yml':
        case '.yaml':
            return {
                __type: 'YAML',
                __unique: unique,
                content: YAML.load(content),
            };
        default:
            return {
                __type: 'other',
                __unique: unique,
                content: content,
            };
    }
};

/**
 * 处理文件
 * @param {*} group 
 * @param {*} processer 
 * @returns 
 */
const processGroup = (group, processer) => {
    const target = path.resolve(process.cwd(), group);
    if (!fs.existsSync(target)) {
        throw new Error('Path not exists:', target);
    }
    args['--verbose'] && console.log('+ group:', group);
    // 处理目录
    if (fs.lstatSync(target).isDirectory()) {
        recursiveReaddirSync(target).forEach(filepath => {
            const unique = filepath.substr(process.cwd().length + 1);
            processer && processer(parse(filepath, unique), unique);
        });
    }
    // 处理文件
    else if (fs.lstatSync(target).isFile()) {
        const unique = target.substr(process.cwd().length + 1);
        processer && processer(parse(target, unique), unique);
    }

};

// 以原始文件组织输出
if (args['--files']) {
    args['_'].forEach(group => {
        processGroup(group, (parsed, unique) => {
            if (args['--out']) {
                const { dir, name } = path.parse(unique);
                writeFile(path.resolve(process.cwd(), args['--out'], dir, `${name}.json`), parsed);
            } else {
                console.log(render(parsed));
            }
        });
    });
}
// 将结果输出到单一文件
else {
    const reuslt = {};
    args['_'].forEach(group => {
        processGroup(group, (parsed) => {
            if (!reuslt[group]) {
                reuslt[group] = [];
            }
            reuslt[group].push(parsed);
        });
    });
    if (args['--out']) {
        writeFile(path.resolve(process.cwd(), args['--out']), reuslt);
    } else {
        console.log(render(reuslt));
    }
}
