var WidgetMetadata = {
  id: "jable.test",
  title: "Jable 测试",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "测试 Forward Widget 是否可加载",
  author: "EL",
  site: "https://jable.tv/",
  modules: [
    {
      id: "test",
      title: "测试",
      functionName: "test",
      params: []
    }
  ]
};

async function test(params = {}) {
  return [
    {
      id: "https://jable.tv/",
      type: "url",
      title: "Jable 测试",
      posterPath: "",
      backdropPath: "",
      mediaType: "movie",
      description: "如果看到这个，说明模块格式对了",
      link: "https://jable.tv/",
      videoUrl: "https://jable.tv/"
    }
  ];
}