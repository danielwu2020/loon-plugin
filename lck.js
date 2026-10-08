// 原作者：lichun
let body = $response.body;

try {
    let obj = JSON.parse(body);

    if (obj && obj.data) {
        if (obj.data.sex !== undefined) {
            obj.data.sex = "1";
        }
        if (obj.data.public_uid !== undefined) {
            obj.data.public_uid = "88888888";
        }
        if (obj.data.nickname !== undefined) {
            obj.data.nickname = "李春";
        }
        if (obj.data.vip_type !== undefined) {
            obj.data.vip_type = "1";
        }
        if (obj.data.show_paper_cover !== undefined) {
            obj.data.show_paper_cover = "1";
        }
        if (obj.data.is_show_ad !== undefined) {
            obj.data.is_show_ad = "0";
        }
        if (obj.data.alert_title !== undefined) {
            obj.data.alert_title = "高贵用户";
        }
        if (obj.data.vip_level !== undefined) {
            obj.data.vip_level = "1";
        }
        if (obj.data.vip_expiration_time !== undefined) {
            obj.data.vip_expiration_time = "2099-12-31 23:59:59";
        }
        if (obj.data.expiration_time !== undefined) {
            obj.data.expiration_time = "2099-12-31 23:59:59";
        }
        if (obj.data.yst_vip_type !== undefined) {
            obj.data.yst_vip_type = "1";
        }
        if (obj.data.yst_vip_expiration_time !== undefined) {
            obj.data.yst_vip_expiration_time = "2099-12-31 23:59:59";
        }
        if (obj.data.user_type !== undefined) {
            obj.data.user_type = "1";
        }
        if (obj.data.rest_exam_count !== undefined) {
            obj.data.rest_exam_count = "9999";
        }
        if (obj.data.auto_analysis_package !== undefined) {
            obj.data.auto_analysis_package = "99";
        }
        if (obj.data.remove_error_limit !== undefined) {
            obj.data.remove_error_limit = "99";
        }
        if (
            obj.data.vip_config &&
            obj.data.vip_config.alert_title !== undefined
        ) {
            obj.data.vip_config.alert_title = "高贵用户";
        }
    }

    $done({ body: JSON.stringify(obj) });
} catch (e) {
    console.log("[sex-rewrite] JSON parse failed: " + e);
    $done({ body: body });
}