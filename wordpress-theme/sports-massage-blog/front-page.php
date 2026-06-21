<?php
if (!defined('ABSPATH')) {
    exit;
}

get_header();
?>
<section class="hero">
    <div class="hero-inner">
        <p class="eyebrow"><?php esc_html_e('Fuengirola · Sports Massage Journal', 'sports-massage-blog'); ?></p>
        <h1 class="hero-title"><?php bloginfo('name'); ?></h1>
        <p class="hero-summary"><?php esc_html_e('Articles about massage, recovery, everyday pain and wellbeing, written to support trust and organic visibility for the main practice.', 'sports-massage-blog'); ?></p>
        <div class="hero-actions">
            <a class="button-primary" href="<?php echo esc_url(home_url('/')); ?>"><?php esc_html_e('View articles', 'sports-massage-blog'); ?></a>
            <a class="button-secondary" href="<?php echo esc_url(sports_massage_blog_main_url('/#contacto')); ?>"><?php esc_html_e('Book appointment', 'sports-massage-blog'); ?></a>
        </div>
    </div>
</section>

<section class="section">
    <div class="section-inner">
        <div class="section-heading">
            <p class="section-eyebrow"><?php esc_html_e('Latest articles', 'sports-massage-blog'); ?></p>
            <h2 class="section-title"><?php esc_html_e('Advice and insights aligned with the main brand', 'sports-massage-blog'); ?></h2>
        </div>
        <div class="post-grid">
            <?php
            $sports_massage_posts = new WP_Query(
                array(
                    'post_type'           => 'post',
                    'posts_per_page'      => 3,
                    'ignore_sticky_posts' => true,
                )
            );

            if ($sports_massage_posts->have_posts()) :
                while ($sports_massage_posts->have_posts()) :
                    $sports_massage_posts->the_post();
                    ?>
                    <article <?php post_class('post-card'); ?>>
                        <div class="post-card-body">
                            <div class="post-meta"><?php echo esc_html(get_the_date()); ?></div>
                            <h3 class="entry-title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
                            <div class="entry-summary"><?php the_excerpt(); ?></div>
                        </div>
                    </article>
                    <?php
                endwhile;
                wp_reset_postdata();
            else :
                ?>
                <article class="post-card">
                    <div class="post-card-body">
                        <div class="post-meta"><?php esc_html_e('Example', 'sports-massage-blog'); ?></div>
                        <h3 class="entry-title"><?php esc_html_e('Your posts will appear here', 'sports-massage-blog'); ?></h3>
                        <div class="entry-summary"><?php esc_html_e('Once you publish posts in WordPress, this homepage will automatically show the latest articles.', 'sports-massage-blog'); ?></div>
                    </div>
                </article>
                <?php
            endif;
            ?>
        </div>
    </div>
</section>
<?php
get_footer();
