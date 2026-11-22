const cache = {};
export function loadData(name) {
    const D = (window.LjData = window.LjData || {});
    if (D[name])
        return Promise.resolve(D[name]);
    if (!cache[name]) {
        cache[name] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = import.meta.env.BASE_URL + 'data/' + name + '.js';
            s.async = true;
            s.onload = () => (D[name] ? resolve(D[name]) : reject(new Error(name + '.js did not define data')));
            s.onerror = () => { delete cache[name]; reject(new Error('Could not load data/' + name + '.js')); };
            document.head.appendChild(s);
        });
    }
    return cache[name];
}
