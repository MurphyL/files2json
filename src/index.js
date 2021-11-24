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
    engines: {
        toml: toml.parse.bind(toml),
    }
};

const out = args['--out'];

const readFile = (filepath) => {
    const text = fs.readFileSync(filepath);
    switch (path.extname(filepath)) {
        case '.md':
            const { data, content, ...extra } = matter(text.toString(), matterOptions);
            return {
                ...data,
                ...extra,
                __type: 'markdown',
                __path: filepath,
                content: content.trim(),
            };
        case '.toml':
            return {
                __type: 'toml',
                __path: filepath,
                ...toml.parse(text.toString()),
            };
        default:
            return {
                __type: 'other',
                __path: filepath,
                content: text.toString(),
            };
    }
};

const readFiles = (files = []) => {
    const temp = {};
    files.forEach(file => {
        const target = path.resolve(process.cwd(), file);
        if (!temp[file]) { 
            temp[file] = [];
        }
        if (!fs.existsSync(target)) {
            return console.warn('Path not exists:', target);
        }
        if (fs.lstatSync(target).isDirectory()) {
            const items = recursive(target);
            items.forEach(item => {
                temp[file].push(readFile(item));
            });
        } else if (fs.lstatSync(target).isFile()) {
            temp[file].push(readFile(target));
        }
    });
    return temp;
}

const output = readFiles(files);

if (out) {
    const target = path.resolve(process.cwd(), out);
    fs.writeFileSync(target, JSON.stringify(output, null, 2));
} else {
    debug && console.log(output);
}
