function makeCrcTable() {
    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c >>> 0;
    }

    return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
        crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(value, 0);
    return buf;
}

function u32(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value >>> 0, 0);
    return buf;
}

function zipBuffers(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
        const name = Buffer.from(file.name, "utf8");
        const data = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
        const crc = crc32(data);
        const size = data.length;
        const localHeader = Buffer.concat([
            Buffer.from("PK\u0003\u0004", "binary"),
            u16(20),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(crc),
            u32(size),
            u32(size),
            u16(name.length),
            u16(0),
            name,
            data,
        ]);

        localParts.push(localHeader);

        const central = Buffer.concat([
            Buffer.from("PK\u0001\u0002", "binary"),
            u16(20),
            u16(20),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(crc),
            u32(size),
            u32(size),
            u16(name.length),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(0),
            u32(offset),
            name,
        ]);

        centralParts.push(central);
        offset += localHeader.length;
    });

    const centralDir = Buffer.concat(centralParts);
    const end = Buffer.concat([
        Buffer.from("PK\u0005\u0006", "binary"),
        u16(0),
        u16(0),
        u16(files.length),
        u16(files.length),
        u32(centralDir.length),
        u32(offset),
        u16(0),
    ]);

    return Buffer.concat([...localParts, centralDir, end]);
}

module.exports = {
    zipBuffers,
};
