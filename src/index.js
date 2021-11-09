#!/usr/bin/env node

const fs = require('fs');
const rw = require('rw');
const arg = require('arg');
const path = require('path');
const toml = require('@iarna/toml');
const matter = require('gray-matter');
const recursive = require("recursive-readdir-sync");

const args = arg({
    '--help': Boolean,
    '--pretty': Boolean,            // JSON 格式化后输出
    '--verbose': Boolean,           // 展示操作日志
    '--display': Boolean,           // 仅用于显示
    '--no-content': Boolean,        // 没有内容
    // Aliases
    '-p': '--pretty',
    '-v': '--verbose',
    '-d': '--display',
});

const debug = args['--verbose'];

if (args['--help']) {
    const text = rw.readFileSync(path.resolve(process.cwd(), 'src/doc.txt'));
    console.log(text.toString());
    return process.exit(0);
}

const { _: dirs = [] } = args;

if (dirs.length < 2) {
    return console.error('请指定输出文件：', dirs);
}

const target = path.resolve(process.cwd(), dirs.pop());

const extensions = ['.toml', '.md'];

const JSON_EXT = '.json';

const ignore = (file) => {
    return extensions.includes(path.extname(file));
};

const matterOptions = {
    engines: {
        toml: toml.parse.bind(toml),
    }
};

const tree = { files: {}, items: [] };

dirs.forEach(dir => {
    const root = path.resolve(process.cwd(), dir);
    const files = recursive(root).filter(ignore);
    tree.files[root] = files;
    debug && console.log(root, files);
    files.forEach(file => {
        const text = rw.readFileSync(file);
        if (text instanceof Error) {
            debug && console.log('读取数据文件出错：', file);
            throw text;
        }
        const location = path.relative(process.cwd(), file);
        switch (path.extname(file)) {
            case '.md':
                const { data, content, ...extra } = matter(text.toString(), matterOptions);
                tree.items.push({
                    ...data,
                    ...extra,
                    __type: 'markdown',
                    __path: location,
                    content: content.trim(),
                });
                break;
            case '.toml':
                tree.items.push({
                    __type: 'toml',
                    __path: location,
                    ...toml.parse(text.toString()),
                });
                break;
            default:
                tree.items.push({
                    __type: 'other',
                    __path: location,
                    content: text.toString(),
                });
                break;
        }
    });
});

if (!fs.existsSync(target) && path.extname(target) !== JSON_EXT) {
    if (path.extname(target) === JSON_EXT) {
        const parent = path.dirname(target);
        fs.mkdirSync(parent, { recursive: true });
        debug && console.log(`output path created: ${parent}\n`);
    } else {
        fs.mkdirSync(target, { recursive: true });
        debug && console.log(`output path created: ${target}\n`);
    }
}

const temp = (path.extname(target) === JSON_EXT) ? target : path.resolve(target, 'merged.json');

rw.writeFileSync(temp, JSON.stringify(tree, null, 4));