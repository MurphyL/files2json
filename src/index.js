#!/usr/bin/env node

const fs = require('fs');
const arg = require('arg');
const path = require('path');
const toml = require('@iarna/toml');
const matter = require('gray-matter');
const recursive = require("recursive-readdir-sync");

const args = arg({
    '--out': String,
    '--help': Boolean,
    '--pretty': Boolean,            // JSON 格式化后输出
    '--verbose': Boolean,           // 展示操作日志
    '--display': Boolean,           // 仅用于显示
    '--no-content': Boolean,        // 没有内容
    // Aliases
    '-o': '--out',
    '-p': '--pretty',
    '-v': '--verbose',
    '-d': '--display',
});

const debug = args['--verbose'];

if (args['--help']) {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'src/doc.txt'));
    console.log(text.toString());
    return process.exit(0);
}

const files = args['_'];

if (files.length === 0) {
    return console.error('请指定输出文件：', files);
}

const matterOptions = {
    language: 'toml',
    engines: {
        toml: toml.parse.bind(toml),
    }
};

const out = args['--out'];

const readFile = (filepath) => {
    switch (path.extname(filepath)) {
        case '.md':
            const { data, content, ...extra } = matter.read(filepath, matterOptions);
            return {
                ...data,
                ...extra,
                __type: 'markdown',
                __unique: path.basename(filepath),
                content: content.trim(),
            };
        case '.toml':
            return {
                __type: 'toml',
                __unique: path.basename(filepath),
                ...toml.parse(fs.readFileSync(filepath).toString()),
            };
        case '.json':
            return {
                __type: 'json',
                __unique: path.basename(filepath),
                ...JSON.parse(fs.readFileSync(filepath).toString()),
            };
        default:
            return {
                __type: 'other',
                __unique: path.basename(filepath),
                content: fs.readFileSync(filepath).toString(),
            };
    }
};

const readFiles = (files = []) => {
    const temp = {};
    files.forEach(file => {
        const target = path.resolve(process.cwd(), file);
        if (!fs.existsSync(target)) {
            return console.warn('Path not exists:', target);
        }
        const stat = fs.lstatSync(target);
        if (stat.isDirectory()) {
            temp[file] = [];
            if (fs.lstatSync(target).isDirectory()) {
                const items = recursive(target);
                items.forEach(item => {
                    temp[file].push(readFile(item));
                });
            } else if (fs.lstatSync(target).isFile()) {
                temp[file].push(readFile(target));
            }
        } else if (stat.isFile()) {
            temp[file] = readFile(target);
        }
    });
    return temp;
}

const output = readFiles(files);

if (out) {
    const target = path.resolve(process.cwd(), out);
    fs.writeFileSync(target, JSON.stringify(output, null, 2));
} else {
    console.log(output);
}
