#!/usr/bin/env node

import fs from 'fs';
import arg from 'arg';
import path from 'path';
import kindOf from 'kind-of';
import YAML from 'js-yaml';
import TOML from '@iarna/toml';
import matter from 'gray-matter';
import parseJSON from 'parse-json';
import { csvParse, tsvParse } from 'd3-dsv';
import stripBOM from 'strip-bom-string';
import stripJSON from 'strip-json-comments';
import recursiveReaddirSync from 'recursive-readdir-sync';

const exts = ['toml', 'yml', 'yaml', 'json'];

const args = arg({
    '--out': String,                // 指定输出位置
    '--help': Boolean,
    '--matter': String,             // 指定Markdown matter
    '--files': Boolean,             // 不合并文件
    '--format': String,             // 文件输出格式：JSON、TOML、YAML
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
    console.log(fs.readFileSync('./README.md').toString());
    process.exit(0);
}

if (args['--version']) {
    const { name, description, version, bin } = parseJSON(fs.readFileSync('./package.json').toString());
    Object.entries(bin).forEach(([sh]) => {
        console.log(`${sh} ${version}`)
    });
    console.log(name);
    console.log(description);
    process.exit(0);
}

if (args['_'].length === 0) {
    console.error('请指定要解析的文件：', args['_']);
}

const matterOptions = {
    excerpt: false,
};

args['--verbose'] && console.log(args['--pretty'] ? 'pretty:' : 'minify:', args['_']);

// Markdown front matter
if (args['--matter'] === 'toml') {
    Object.assign(matterOptions, {
        language: 'toml',
        engines: {
            // 指定 TOML 解析引擎
            toml: TOML.parse.bind(TOML),
        }
    });
}

args['--verbose'] && console.log(`use [${(args['--matter'] === 'toml') ? 'TOML' : 'YAML'}] parse markdown front matter`);

// 输出数据序列化信息
const format = args['--format'];
const suffix = format ? (exts.includes(format.toLowerCase()) ? format.toLowerCase() : 'json') : 'json';
args['--verbose'] && console.log(`use [${suffix.toUpperCase()}] render data`);

// 输出目录
args['--verbose'] && console.log('output:', args['--out']);

/**
 * JSON 渲染
 * @param {*} data 
 * @returns 
 */
const render = (data) => {
    const format = (args['--format'] || 'json').toLowerCase();
    switch (format) {
        case 'yml':
        case 'yaml':
            return YAML.dump(data);
        case 'toml':
            return TOML.stringify(data);
        default:
            return args['--pretty'] ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    }

};

/**
 * 数据写入到文件
 * @param {*} target 
 * @param {*} data 
 */
const writeFile = (target, data) => {
    // 当输出目标已存在时
    if (fs.existsSync(target)) {
        const stat = fs.lstatSync(target);
        // 若输出目标是已存在的文件，则先删除
        if (stat.isFile()) {
            fs.rmSync(target);
        }
        // 若输出目标是目录，则直接报错
        else if (stat.isDirectory()) {
            throw new Error('output file must not directory:' + target);
        }
    }
    // 创建上一级目录
    const dirname = path.dirname(target);
    if (!fs.existsSync(dirname)) {
        args['--verbose'] && console.log('+-- make directory:', dirname);
        fs.mkdirSync(dirname, { recursive: true });
    }
    // 将数据写入文件
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
    const meta = { __unique: unique, __timestamp: new Date() };
    const ext = path.extname(filepath);
    switch (ext) {
        case '.json':
            return {
                ...meta,
                __type: 'JSON',
                __content: parseJSON(stripJSON(content)),
            };
        case '.md':
            const { data, content: body, excerpt, isEmpty, ...extra } = matter(content, matterOptions);
            return {
                ...meta,
                __type: 'Markdown',
                __content: {
                    ...data,
                    ...extra,
                    body: body.trim()
                },
            };
        case '.csv':
            return {
                ...meta,
                __type: 'CSV',
                __content: csvParse(content),
            };
        case '.tsv':
            return {
                ...meta,
                __type: 'TSV',
                __content: tsvParse(content),
            };
        case '.toml':
            return {
                ...meta,
                __type: 'TOML',
                __content: TOML.parse(content),
            };
        case '.yml':
        case '.yaml':
            return {
                ...meta,
                __type: 'YAML',
                __content: YAML.load(content),
            };
        default:
            return {
                ...meta,
                __type: ext,
                __content: content,
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
        throw new Error('Path not exists:' + target);
    }
    args['--verbose'] && console.log('+ group:', group);
    // 处理目录
    if (fs.lstatSync(target).isDirectory()) {
        recursiveReaddirSync(target).forEach(filepath => {
            const unique = filepath.substr(process.cwd().length + 1);
            kindOf(processer) === 'function' && processer(parse(filepath, unique), unique);
        });
    }
    // 处理文件
    else if (fs.lstatSync(target).isFile()) {
        const unique = target.substr(process.cwd().length + 1);
        kindOf(processer) === 'function' && processer(parse(target, unique), unique);
    }

};

// 以原始文件组织输出
if (args['--files']) {
    new Set(args['_']).forEach(group => {
        processGroup(group, (parsed, unique) => {
            if (args['--out']) {
                const { dir, name } = path.parse(unique);
                writeFile(path.resolve(process.cwd(), args['--out'], dir, `${name}.${suffix}`), parsed);
            } else {
                console.log(render(parsed));
            }
        });
    });
}
// 将结果输出到单一文件
else {
    const reuslt = {};
    new Set(args['_']).forEach(group => {
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
